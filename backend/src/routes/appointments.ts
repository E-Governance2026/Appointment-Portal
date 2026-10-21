import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePermission, requireCanView, assertTransitionOrThrow } from '../domain/guards.js'
import { canViewAppointment } from '../domain/permissions.js'
import { APPOINTMENT_COLUMNS, toAppointmentDto, type AppointmentRow } from './appointmentMapper.js'
import { AUDIT_COLUMNS, appendEvent, toTimelineDto, type AuditRow } from './auditLog.js'
import { AUTHORITIES, BOOK_WITH_OPTIONS } from '../seed/seedData.js'
import type { Actor } from '../types.js'

// ─── Appointments routes ──────────────────────────────────────────────────────
// Read endpoints (list + single) scoped by the same row-level visibility rule
// the frontend uses (canViewAppointment), plus the 3-step booking submit.
export const appointmentsRouter = Router()

// ── Scoping ──
// Pre-filter the query by role so we fetch only rows the actor could see, then
// apply canViewAppointment per row as defense-in-depth (and to catch the
// requester/own-id edge). Mirrors fetchApprovalQueue + canViewAppointment.
// The PostgREST filter builder is generically typed; `query` is a chainable
// builder whose exact type depends on the prior select, so we accept it loosely.
function applyScope<Q extends { or(f: string): Q; eq(c: string, v: string): Q }>(
  query: Q,
  actor: Actor,
): Q {
  switch (actor.role) {
    case 'super_admin':
    case 'admin_dispatcher':
      return query // see everything (admin also runs the reception desk)
    case 'coordinator_authority':
      // rows assigned to their role, or unassigned.
      return query.or(`assigned_role.eq.${actor.role},assigned_role.is.null`)
    case 'requester':
    default:
      return query.eq('requester_id', actor.id)
  }
}

// GET /appointments — the list the actor may see.
appointmentsRouter.get('/', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const supabase = getSupabase()

    let query = supabase.from('appointments').select(APPOINTMENT_COLUMNS)
    query = applyScope(query, actor)
    const { data, error } = await query.order('submitted_at', { ascending: false })
    if (error) throw new HttpError('internal_error', error.message)

    const rows = (data ?? []) as unknown as AppointmentRow[]
    // Defense-in-depth: re-check each row against the shared rule.
    const visible = rows.filter(r =>
      canViewAppointment(
        { id: actor.id, name: actor.name, role: actor.role },
        { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
      ),
    )
    res.json({ appointments: visible.map(toAppointmentDto) })
  } catch (err) {
    next(err)
  }
})

// GET /appointments/reception/queue?date=YYYY-MM-DD — the reception desk queue
// for a day: confirmed (expected / in progress) + completed (already seen),
// ordered by time, scoped to what the actor may see. Declared BEFORE '/:id' so
// the literal "reception" segment is not captured as an id.
appointmentsRouter.get('/reception/queue', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'visitor.checkIn')

    const date = String(req.query.date ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpError('validation', 'Provide a date as YYYY-MM-DD.')
    }

    const supabase = getSupabase()
    let query = supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .eq('date', date)
      .in('status', ['confirmed', 'completed'])
    query = applyScope(query, actor)
    const { data, error } = await query.order('time', { ascending: true })
    if (error) throw new HttpError('internal_error', error.message)

    const rows = (data ?? []) as unknown as AppointmentRow[]
    const visible = rows.filter(r =>
      canViewAppointment(
        { id: actor.id, name: actor.name, role: actor.role },
        { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
      ),
    )
    res.json({ queue: visible.map(toAppointmentDto) })
  } catch (err) {
    next(err)
  }
})

// GET /appointments/:id — a single appointment the actor may see.
appointmentsRouter.get('/:id', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .eq('id', req.params.id)
      .maybeSingle()
    if (error) throw new HttpError('internal_error', error.message)
    if (!data) throw new HttpError('not_found', `Appointment ${req.params.id} not found.`)

    const row = data as unknown as AppointmentRow
    requireCanView(
      { id: actor.id, name: actor.name, role: actor.role },
      { requester: row.requester, requesterId: row.requester_id ?? undefined, assignedRole: row.assigned_role ?? undefined },
    )
    res.json({ appointment: toAppointmentDto(row) })
  } catch (err) {
    next(err)
  }
})

// ── Submit (3-step booking) ──
// Step 1: appointment-with = one of BOOK_WITH_OPTIONS (Department / Shivendra
//         sir / Jaimi sir) -> resolves to an authority.
// Step 2: date + time, both OPTIONAL (the authority proposes a time at
//         approval when left blank).
// Step 3: subject + reason (description).
// The appointment TYPE is DERIVED from the chosen authority, never picked by
// the requester.
export const submitSchema = z.object({
  bookWith:    z.string().min(1, 'Choose who the appointment is with.'),
  date:        z.string().trim().optional().default(''),
  time:        z.string().trim().optional().default(''),
  subject:     z.string().trim().min(1, 'Enter a subject.'),
  description: z.string().trim().min(1, 'Describe the reason for the appointment.'),
})

// Resolve the step-1 choice to an authority record. Accepts either a
// BOOK_WITH_OPTIONS key ('department' / 'auth-ss' / 'auth-ap') or a raw
// authority id. Exported for unit testing.
export function resolveAuthority(bookWith: string) {
  const option = BOOK_WITH_OPTIONS.find(o => o.key === bookWith)
  const authorityId = option ? option.authorityId : bookWith
  const authority = AUTHORITIES.find(a => a.id === authorityId)
  return authority ?? null
}

// A short random suffix keeps generated ids unique without a DB sequence.
function nextAppointmentId(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `APT-2026-${n}`
}

appointmentsRouter.post('/', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'appointment.create')

    const parsed = submitSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid booking details.')
    }
    const { bookWith, date, time, subject, description } = parsed.data

    const authority = resolveAuthority(bookWith)
    if (!authority) {
      throw new HttpError('validation', 'The selected authority is not available.')
    }
    if (!authority.active) {
      throw new HttpError('validation', 'The selected authority is not currently accepting appointments.')
    }

    // Derive the type from the authority (first handled type). Never requester-
    // chosen, per the 3-step flow.
    const derivedTypeId = authority.typeIds[0] ?? null

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const initials = actor.name
      .split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')

    const insertRow = {
      id:                 nextAppointmentId(),
      requester:          actor.name,
      requester_id:       actor.id,
      requester_initials: initials,
      requester_category: 'Staff',
      type_id:            derivedTypeId,
      type_name:          '',
      purpose_label:      '',
      department:         authority.department,
      authority_id:       authority.id,
      authority_name:     authority.name,
      date:               date.length > 0 ? date : null,
      time:               time.length > 0 ? time : null,
      subject,
      description,
      mode:               'physical' as const,
      location_label:     '',
      documents_count:    0,
      status:             'submitted' as const,
      submitted_at:       now,
      assigned_stage:     'Authority review',
      assigned_role:      'coordinator_authority' as const,
      assigned_to_id:     authority.id,
      updated_at:         now,
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert(insertRow)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    res.status(201).json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})

// ─── Workflow (B5): approve / reject / request-info / confirm + timeline ──────
// Each write action: requirePermission → load the row → requireCanView →
// assertTransitionOrThrow → update the row → append an audit event. Mirrors the
// write functions in src/services/appointmentsService.ts so the server enforces
// the same rules the mock UI does.

// Load a row by id or throw 404; shared by the workflow handlers.
async function loadRow(id: string): Promise<AppointmentRow> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new HttpError('internal_error', error.message)
  if (!data) throw new HttpError('not_found', `Appointment ${id} not found.`)
  return data as unknown as AppointmentRow
}

// Throw 403 unless the actor may view this row. Reused across handlers.
function assertCanView(actor: Actor, row: AppointmentRow): void {
  requireCanView(
    { id: actor.id, name: actor.name, role: actor.role },
    { requester: row.requester, requesterId: row.requester_id ?? undefined, assignedRole: row.assigned_role ?? undefined },
  )
}

const slotSchema = z.object({
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
})

// POST /appointments/:id/approve
// Moves submitted|rescheduled → approved. If the request has no slot yet, the
// approver MUST supply { date, time }; if it already has one, a slot in the
// body overrides it. Appends an 'approved' event.
export const approveSchema = z.object({
  note: z.string().trim().optional(),
  slot: slotSchema.optional(),
})
appointmentsRouter.post('/:id/approve', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'appointment.approve')

    const parsed = approveSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid approval details.')
    }
    const { note, slot } = parsed.data

    const row = await loadRow(req.params.id)
    assertCanView(actor, row)
    if (row.status === 'approved') {
      throw new HttpError('duplicate', 'This request has already been approved.')
    }
    assertTransitionOrThrow(row.status, 'approved')

    const alreadyHasSlot = !!row.date && !!row.time
    let date = row.date
    let time = row.time
    if (!alreadyHasSlot) {
      if (!slot) throw new HttpError('illegal_transition', 'Provide a date and time to approve this request.')
      date = slot.date
      time = slot.time
    } else if (slot) {
      date = slot.date
      time = slot.time
    }

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'approved', date, time, assigned_stage: 'Confirmation pending', updated_at: now })
      .eq('id', row.id)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    const slotDetail = `Scheduled for ${date} at ${time}.`
    await appendEvent(supabase, {
      appointmentId: row.id, action: 'approved',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: `Approved by ${actor.name}.`,
      detail: note ? `${slotDetail} ${note}` : slotDetail,
      fromStatus: row.status, toStatus: 'approved',
    })

    res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})

// POST /appointments/:id/reject — reason required. → rejected.
export const reasonSchema = z.object({ reason: z.string().trim().min(1, 'A reason is required to reject a request.') })
appointmentsRouter.post('/:id/reject', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'appointment.reject')
    const parsed = reasonSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'A reason is required.')
    }
    const row = await loadRow(req.params.id)
    assertCanView(actor, row)
    assertTransitionOrThrow(row.status, 'rejected')

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'rejected', assigned_stage: 'Rejected', updated_at: now })
      .eq('id', row.id)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    await appendEvent(supabase, {
      appointmentId: row.id, action: 'rejected',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: `Rejected by ${actor.name}.`, detail: parsed.data.reason,
      fromStatus: row.status, toStatus: 'rejected',
    })

    res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})

// POST /appointments/:id/request-info — message required. → additional-info.
export const messageSchema = z.object({ message: z.string().trim().min(1, 'Describe what information is needed.') })
appointmentsRouter.post('/:id/request-info', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'appointment.requestInfo')
    const parsed = messageSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'A message is required.')
    }
    const row = await loadRow(req.params.id)
    assertCanView(actor, row)
    assertTransitionOrThrow(row.status, 'additional-info')

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'additional-info', assigned_stage: 'Awaiting requester', updated_at: now })
      .eq('id', row.id)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    await appendEvent(supabase, {
      appointmentId: row.id, action: 'info-requested',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: `Information requested by ${actor.name}.`, detail: parsed.data.message,
      fromStatus: row.status, toStatus: 'additional-info',
    })

    res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})

// POST /appointments/:id/confirm — approved → confirmed. Requires a slot set.
// Appends a 'confirmed' event plus a 'notification-sent' event (website + email).
appointmentsRouter.post('/:id/confirm', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'appointment.confirm')
    const row = await loadRow(req.params.id)
    assertCanView(actor, row)
    if (row.status === 'confirmed') {
      throw new HttpError('duplicate', 'This appointment is already confirmed.')
    }
    if (!row.date || !row.time) {
      throw new HttpError('illegal_transition', 'A date and time must be set before confirming.')
    }
    assertTransitionOrThrow(row.status, 'confirmed')

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'confirmed', assigned_stage: 'Confirmed', updated_at: now })
      .eq('id', row.id)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    await appendEvent(supabase, {
      appointmentId: row.id, action: 'confirmed',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: `Confirmed by ${actor.name}.`,
      fromStatus: row.status, toStatus: 'confirmed',
    })
    // Confirmation notification (website + email), recorded as a system event.
    await appendEvent(supabase, {
      appointmentId: row.id, action: 'notification-sent',
      actorId: 'system', actorName: 'System', actorRole: 'system',
      summary: 'Confirmation sent to the requester by website and email.',
      detail: `Appointment confirmed for ${row.date} at ${row.time}.`,
    })

    res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})

// GET /appointments/:id/timeline — audit events for an appointment the actor
// may view. Requesters do not see internal (visible_to_requester = false) events.
appointmentsRouter.get('/:id/timeline', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    const row = await loadRow(req.params.id)
    assertCanView(actor, row)

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('audit_events')
      .select(AUDIT_COLUMNS)
      .eq('appointment_id', row.id)
      .order('timestamp', { ascending: true })
    if (error) throw new HttpError('internal_error', error.message)

    let rows = (data ?? []) as unknown as AuditRow[]
    if (actor.role === 'requester') {
      rows = rows.filter(r => r.visible_to_requester)
    }
    res.json({ timeline: rows.map(toTimelineDto) })
  } catch (err) {
    next(err)
  }
})

// ─── Visitor check-in / check-out + no-show (B6) ──────────────────────────────
// Reception-desk actions, owned by admin_dispatcher (and super_admin). check-in
// and check-out are audit actions, not status changes: the status stays
// 'confirmed' through the visit and check-out transitions it to 'completed'.

// POST /appointments/:id/check-in — confirmed only. Sets checked_in_at.
appointmentsRouter.post('/:id/check-in', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'visitor.checkIn')
    const row = await loadRow(req.params.id)
    assertCanView(actor, row)
    if (row.status !== 'confirmed') {
      throw new HttpError('illegal_transition', 'Only confirmed appointments can be checked in.')
    }
    if (row.checked_in_at) {
      throw new HttpError('duplicate', 'This visitor has already been checked in.')
    }

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments')
      .update({ checked_in_at: now, assigned_stage: 'Checked in', updated_at: now })
      .eq('id', row.id)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    await appendEvent(supabase, {
      appointmentId: row.id, action: 'checked-in',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: `Visitor checked in by ${actor.name}.`,
    })

    res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})

// POST /appointments/:id/check-out — requires a prior check-in. Records the
// departure and completes the appointment (confirmed → completed).
appointmentsRouter.post('/:id/check-out', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'visitor.checkOut')
    const row = await loadRow(req.params.id)
    assertCanView(actor, row)
    if (!row.checked_in_at) {
      throw new HttpError('illegal_transition', 'The visitor must be checked in before checking out.')
    }
    if (row.checked_out_at) {
      throw new HttpError('duplicate', 'This visitor has already been checked out.')
    }
    assertTransitionOrThrow(row.status, 'completed')

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments')
      .update({ checked_out_at: now, status: 'completed', assigned_stage: 'Completed', updated_at: now })
      .eq('id', row.id)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    await appendEvent(supabase, {
      appointmentId: row.id, action: 'checked-out',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: `Visitor checked out by ${actor.name}.`,
    })
    await appendEvent(supabase, {
      appointmentId: row.id, action: 'completed',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: 'Appointment completed.',
      fromStatus: row.status, toStatus: 'completed',
    })

    res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})

// POST /appointments/:id/not-reported — the time passed with no check-in.
// confirmed → not-reported.
appointmentsRouter.post('/:id/not-reported', requireAuth(), async (req, res, next) => {
  try {
    const actor = req.actor!
    requirePermission(actor, 'appointment.markNotReported')
    const row = await loadRow(req.params.id)
    assertCanView(actor, row)
    assertTransitionOrThrow(row.status, 'not-reported')

    const supabase = getSupabase()
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'not-reported', assigned_stage: 'Not reported', updated_at: now })
      .eq('id', row.id)
      .select(APPOINTMENT_COLUMNS)
      .single()
    if (error) throw new HttpError('internal_error', error.message)

    await appendEvent(supabase, {
      appointmentId: row.id, action: 'not-reported',
      actorId: actor.id, actorName: actor.name, actorRole: actor.role,
      summary: `Marked not reported by ${actor.name}.`,
      fromStatus: row.status, toStatus: 'not-reported',
    })

    res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
  } catch (err) {
    next(err)
  }
})
