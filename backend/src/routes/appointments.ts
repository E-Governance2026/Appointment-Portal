import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { declarePermission } from '../middleware/permission.js'
import { requireCanView, assertTransitionOrThrow } from '../domain/guards.js'
import { canViewAppointment, ROLES } from '../domain/permissions.js'
import { APPOINTMENT_COLUMNS, toAppointmentDto, type AppointmentRow } from './appointmentMapper.js'
import { AUDIT_COLUMNS, appendEvent, toTimelineDto, type AuditRow } from './auditLog.js'
import { sweepNoShows } from '../domain/noShowSweep.js'
import { AUTHORITIES, BOOK_WITH_OPTIONS } from '../seed/seedData.js'
import { generateGoogleMeetLink } from '../domain/googleMeet.js'
import fs from 'node:fs'
import rateLimit from 'express-rate-limit'
import { recordAuditEvent } from '../lib/auditTrail.js'
import { sanitizePostgrestFilter } from '../lib/sanitizer.js'
import { handleStreamingUpload, getDocumentRecord } from '../lib/fileUpload.js'
import type { Actor, Role } from '../types.js'

// ─── Appointments routes ──────────────────────────────────────────────────────
// Scoped by row-level visibility (canViewAppointment), query-level filtering
// (applyScope), optimistic concurrency locks, and deny-by-default route declarations.
export const appointmentsRouter = Router()

// ── Scoping ──
// Query-level scoping ensuring records outside actor's visibility cannot be retrieved.
export function applyScope<Q extends { or(f: string): Q; eq(c: string, v: string): Q }>(
  query: Q,
  actor: Actor,
): Q {
  switch (actor.role) {
    case 'super_admin':
    case 'admin_dispatcher':
      return query // see everything (admin dispatcher also runs reception)
    case 'coordinator_authority': {
      const safeRole = sanitizePostgrestFilter(actor.role)
      const safeId = sanitizePostgrestFilter(actor.id)
      if (actor.department) {
        const safeDept = sanitizePostgrestFilter(actor.department)
        return query.or(`assigned_role.eq.${safeRole},assigned_to_id.eq.${safeId},department.eq.${safeDept},assigned_role.is.null`)
      }
      return query.or(`assigned_role.eq.${safeRole},assigned_to_id.eq.${safeId},assigned_role.is.null`)
    }
    case 'requester':
    default:
      return query.eq('requester_id', actor.id)
  }
}

// Determine if the actor is authorized to see the online meeting URL
export function canViewMeetingUrl(actor: Actor, row: AppointmentRow): boolean {
  if (actor.role === 'super_admin') return true
  if (actor.role === 'admin_dispatcher') return true
  if (actor.id === row.requester_id) return true
  if (actor.id === row.authority_id || actor.id === row.assigned_to_id) return true
  if (actor.role === 'coordinator_authority') {
    if (actor.department && row.department === actor.department) return true
    return row.assigned_role === 'coordinator_authority' || !row.assigned_role
  }
  return false
}

// ── Idempotency cache for booking submissions ──
const IDEMPOTENCY_CACHE = new Map<string, { appointment: any; expiresAt: number }>()

// ── Shared loader: loadRow enforces query-level scope and returns 404 if inaccessible ──
export async function loadRow(id: string, actor: Actor, req?: Request): Promise<AppointmentRow> {
  if (req && (req as any).__loadedRow && (req as any).__loadedRow.id === id) {
    return (req as any).__loadedRow
  }
  const supabase = getSupabase()
  let query = supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .eq('id', id)
  query = applyScope(query, actor)
  const { data, error } = await query.maybeSingle()
  if (error) throw new HttpError('internal_error', error.message)
  if (!data) throw new HttpError('not_found', 'Appointment not found.')
  const row = data as unknown as AppointmentRow

  // Defense-in-depth: row-level check (throws 404 to prevent IDOR)
  requireCanView(
    { id: actor.id, name: actor.name, role: actor.role },
    { requester: row.requester, requesterId: row.requester_id ?? undefined, assignedRole: row.assigned_role ?? undefined },
  )
  if (req) {
    (req as any).__loadedRow = row
  }
  return row
}

// Global authentication & automated IDOR resolution on all /appointments routes
appointmentsRouter.use(requireAuth())

appointmentsRouter.param('id', async (req: Request, _res: Response, next: NextFunction, id: string) => {
  try {
    const actor = req.actor
    if (actor && id) {
      await loadRow(id, actor, req)
    }
    next()
  } catch (err) {
    next(err)
  }
})

// GET /appointments — the list the actor may see.
appointmentsRouter.get(
  '/',
  requireAuth(),
  declarePermission('GET', '/appointments', ['appointment.viewOwn', 'appointment.viewAssigned']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const supabase = getSupabase()

      let query = supabase.from('appointments').select(APPOINTMENT_COLUMNS)
      query = applyScope(query, actor)
      const { data, error } = await query.order('submitted_at', { ascending: false })
      if (error) throw new HttpError('internal_error', error.message)

      const rows = (data ?? []) as unknown as AppointmentRow[]
      const visible = rows.filter(r =>
        canViewAppointment(
          { id: actor.id, name: actor.name, role: actor.role },
          { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
        ),
      )
      // Meeting URLs stripped from lists per requirement 4
      res.json({ appointments: visible.map(r => toAppointmentDto(r, { includeMeetingUrl: false })) })
    } catch (err) {
      next(err)
    }
  },
)

// GET /appointments/reception/queue?date=YYYY-MM-DD — reception desk queue
appointmentsRouter.get(
  '/reception/queue',
  requireAuth(),
  declarePermission('GET', '/appointments/reception/queue', 'visitor.checkIn'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
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
      res.json({ queue: visible.map(r => toAppointmentDto(r, { includeMeetingUrl: false })) })
    } catch (err) {
      next(err)
    }
  },
)

// GET /appointments/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
appointmentsRouter.get(
  '/calendar',
  requireAuth(),
  declarePermission('GET', '/appointments/calendar', 'calendar.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const from = String(req.query.from ?? '').trim()
      const to   = String(req.query.to ?? '').trim()
      const dateRe = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRe.test(from) || !dateRe.test(to)) {
        throw new HttpError('validation', 'Provide from and to dates as YYYY-MM-DD.')
      }

      const supabase = getSupabase()
      let query = supabase.from('appointments').select(APPOINTMENT_COLUMNS).gte('date', from).lte('date', to)
      query = applyScope(query, actor)
      const { data, error } = await query.order('date', { ascending: true })
      if (error) throw new HttpError('internal_error', error.message)

      const rows = (data ?? []) as unknown as AppointmentRow[]
      const visible = rows.filter(r => canViewAppointment(
        { id: actor.id, name: actor.name, role: actor.role },
        { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
      ))
      res.json({ appointments: visible.map(r => toAppointmentDto(r, { includeMeetingUrl: false })) })
    } catch (err) {
      next(err)
    }
  },
)

// GET /appointments/day?date=YYYY-MM-DD
appointmentsRouter.get(
  '/day',
  requireAuth(),
  declarePermission('GET', '/appointments/day', 'calendar.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const date = String(req.query.date ?? '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new HttpError('validation', 'Provide a date as YYYY-MM-DD.')
      }

      const supabase = getSupabase()
      let query = supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('date', date)
      query = applyScope(query, actor)
      const { data, error } = await query.order('time', { ascending: true })
      if (error) throw new HttpError('internal_error', error.message)

      const rows = (data ?? []) as unknown as AppointmentRow[]
      const visible = rows.filter(r => canViewAppointment(
        { id: actor.id, name: actor.name, role: actor.role },
        { requester: r.requester, requesterId: r.requester_id ?? undefined, assignedRole: r.assigned_role ?? undefined },
      ))
      res.json({ appointments: visible.map(r => toAppointmentDto(r, { includeMeetingUrl: false })) })
    } catch (err) {
      next(err)
    }
  },
)

// ── In-memory draft store per user ──
const USER_DRAFTS = new Map<string, unknown>()

// GET /appointments/draft
appointmentsRouter.get(
  '/draft',
  requireAuth(),
  declarePermission('GET', '/appointments/draft', 'appointment.create'),
  (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    const draft = USER_DRAFTS.get(req.actor!.id) ?? null
    res.json({ draft })
  },
)

// POST /appointments/draft
appointmentsRouter.post(
  '/draft',
  requireAuth(),
  declarePermission('POST', '/appointments/draft', 'appointment.create'),
  (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    USER_DRAFTS.set(req.actor!.id, req.body.draft ?? req.body)
    res.json({ ok: true })
  },
)

// DELETE /appointments/draft
appointmentsRouter.delete(
  '/draft',
  requireAuth(),
  declarePermission('DELETE', '/appointments/draft', 'appointment.create'),
  (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    USER_DRAFTS.delete(req.actor!.id)
    res.status(204).end()
  },
)

// GET /appointments/:id — single appointment the actor may see
appointmentsRouter.get(
  '/:id',
  requireAuth(),
  declarePermission('GET', '/appointments/:id', ['appointment.viewOwn', 'appointment.viewAssigned']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)
      const allowMeeting = canViewMeetingUrl(actor, row)
      res.json({ appointment: toAppointmentDto(row, { includeMeetingUrl: allowMeeting }) })
    } catch (err) {
      next(err)
    }
  },
)

// ── Submit (3-step booking) Schema ──
export const submitSchema = z.object({
  bookWith:    z.string().min(1, 'Choose who the appointment is with.'),
  date:        z.string().trim().optional().default(''),
  time:        z.string().trim().optional().default(''),
  subject:     z.string().trim().min(1, 'Enter a subject.'),
  description: z.string().trim().min(1, 'Describe the reason for the appointment.'),
  mode:        z.enum(['physical', 'online', 'phone']).optional().default('physical'),
}).strict()

export function resolveAuthority(bookWith: string) {
  const option = BOOK_WITH_OPTIONS.find(o => o.key === bookWith)
  const authorityId = option ? option.authorityId : bookWith
  const authority = AUTHORITIES.find(a => a.id === authorityId)
  return authority ?? null
}

function nextAppointmentId(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `APT-2026-${n}`
}

// POST /appointments — submit new appointment
appointmentsRouter.post(
  '/',
  requireAuth(),
  declarePermission('POST', '/appointments', 'appointment.create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!

      // Idempotency key check to prevent duplicate submissions
      const idempotencyKey = (req.header('idempotency-key') || req.header('x-idempotency-key') || '').trim()
      if (idempotencyKey) {
        const cached = IDEMPOTENCY_CACHE.get(`${actor.id}:${idempotencyKey}`)
        if (cached && Date.now() < cached.expiresAt) {
          return res.status(200).json(cached.appointment)
        }
      }

      const parsed = submitSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid booking details.')
      }
      const { bookWith, date, time, subject, description, mode } = parsed.data

      const authority = resolveAuthority(bookWith)
      if (!authority) {
        throw new HttpError('validation', 'The selected authority is not available.')
      }
      if (!authority.active) {
        throw new HttpError('validation', 'The selected authority is not currently accepting appointments.')
      }

      const derivedTypeId = authority.typeIds[0] ?? null
      const supabase = getSupabase()
      const now = new Date().toISOString()
      const initials = actor.name
        .split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')

      let resolvedTypeName = 'Unspecified'
      if (derivedTypeId) {
        const { data: typeRow } = await supabase
          .from('appointment_types')
          .select('name')
          .eq('id', derivedTypeId)
          .maybeSingle()
        if (typeRow?.name) resolvedTypeName = typeRow.name
      }

      const insertRow = {
        id:                 nextAppointmentId(),
        requester:          actor.name,
        requester_id:       actor.id,
        requester_initials: initials,
        requester_category: 'Staff',
        type_id:            derivedTypeId,
        type_name:          resolvedTypeName,
        purpose_label:      '',
        department:         authority.department,
        authority_id:       authority.id,
        authority_name:     authority.name,
        date:               date.length > 0 ? date : null,
        time:               time.length > 0 ? time : null,
        subject,
        description,
        mode:               (mode === 'online' ? 'online' : 'physical') as 'physical' | 'online' | 'phone',
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

      USER_DRAFTS.delete(actor.id)
      const createdRow = data as unknown as AppointmentRow
      const responsePayload = { appointment: toAppointmentDto(createdRow, { includeMeetingUrl: true }) }

      if (idempotencyKey) {
        IDEMPOTENCY_CACHE.set(`${actor.id}:${idempotencyKey}`, {
          appointment: responsePayload,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        })
      }

      await appendEvent(supabase, {
        appointmentId: createdRow.id,
        action: 'submitted',
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        summary: `Appointment request submitted by ${actor.name}.`,
        toStatus: 'submitted',
      })

      res.status(201).json(responsePayload)
    } catch (err) {
      next(err)
    }
  },
)

const slotSchema = z.object({
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
}).strict()

export const approveSchema = z.object({
  note: z.string().trim().optional(),
  slot: slotSchema.optional(),
  meetingUrl: z.string().trim().optional(),
  confirm: z.boolean().optional(),
}).strict()

// POST /appointments/:id/approve — with optimistic locking
appointmentsRouter.post(
  '/:id/approve',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/approve', 'appointment.approve'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = approveSchema.safeParse(req.body ?? {})
      if (!parsed.success) {
        throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid approval details.')
      }
      const { note, slot, meetingUrl, confirm: shouldConfirm } = parsed.data

      const row = await loadRow(req.params.id, actor)
      if (row.status === 'confirmed') {
        throw new HttpError('duplicate', 'This request has already been confirmed.')
      }
      if (row.status === 'approved' && !shouldConfirm) {
        throw new HttpError('duplicate', 'This request has already been approved.')
      }
      if (row.status !== 'approved') {
        assertTransitionOrThrow(row.status, 'approved', actor.role)
      }

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
      const meetUrl = (meetingUrl && meetingUrl.trim()) || (row.location_label && row.location_label.startsWith('http') ? row.location_label : (row.mode === 'online' ? generateGoogleMeetLink(row.id) : ''))

      const isConfirming = shouldConfirm === true
      const targetStatus = isConfirming ? 'confirmed' : 'approved'
      const targetStage = isConfirming ? 'Confirmed' : 'Confirmation pending'

      const updateObj: Record<string, unknown> = {
        status: targetStatus,
        date,
        time,
        assigned_stage: targetStage,
        updated_at: now,
      }
      if (meetUrl) {
        updateObj.location_label = meetUrl
      }

      // Optimistic concurrency check: row.status must still match
      const { data, error } = await supabase
        .from('appointments')
        .update(updateObj)
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently by another user.')

      // Redact raw meeting links in audit text to prevent leakage per requirement 4
      const meetNote = meetUrl ? ' Online meeting link generated.' : ''
      const slotDetail = `Scheduled for ${date} at ${time}.${meetNote}`

      if (row.status !== 'approved') {
        await appendEvent(supabase, {
          appointmentId: row.id, action: 'approved',
          actorId: actor.id, actorName: actor.name, actorRole: actor.role,
          summary: `Approved by ${actor.name}.`,
          detail: note ? `${slotDetail} ${note}` : slotDetail,
          fromStatus: row.status, toStatus: 'approved',
        })
      }

      if (isConfirming) {
        await appendEvent(supabase, {
          appointmentId: row.id, action: 'confirmed',
          actorId: actor.id, actorName: actor.name, actorRole: actor.role,
          summary: `Confirmed by ${actor.name}.`,
          fromStatus: 'approved', toStatus: 'confirmed',
        })
        await appendEvent(supabase, {
          appointmentId: row.id, action: 'notification-sent',
          actorId: 'system', actorName: 'System', actorRole: 'system',
          summary: 'Confirmation sent to the requester by website and email.',
          detail: `Appointment confirmed for ${date} at ${time}.`,
        })
      }

      const updatedRow = data as unknown as AppointmentRow
      const allowMeet = canViewMeetingUrl(actor, updatedRow)
      res.json({ appointment: toAppointmentDto(updatedRow, { includeMeetingUrl: allowMeet }) })
    } catch (err) {
      next(err)
    }
  },
)

// POST /appointments/:id/meeting-url — update meeting link with permission check
appointmentsRouter.post(
  '/:id/meeting-url',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/meeting-url', 'appointment.approve'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)

      const schema = z.object({ meetingUrl: z.string().trim() }).strict()
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) {
        throw new HttpError('validation', 'Invalid meeting URL.')
      }
      const { meetingUrl } = parsed.data

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ location_label: meetingUrl, updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'internal-remark',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Google Meet link updated by ${actor.name}.`,
        detail: 'Meeting link updated.',
      })

      const allowMeet = canViewMeetingUrl(actor, row)
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow, { includeMeetingUrl: allowMeet }) })
    } catch (err) {
      next(err)
    }
  },
)

export const reassignSchema = z.object({
  newAuthorityId: z.string().trim().min(1, 'Target authority is required.'),
  reason:         z.string().trim().min(1, 'A reason for reassignment is required.'),
}).strict()

// POST /appointments/:id/reassign — reassign authority within same department
appointmentsRouter.post(
  '/:id/reassign',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/reassign', 'appointment.forward'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const parsed = reassignSchema.safeParse(req.body ?? {})
      if (!parsed.success) {
        throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid reassignment request.')
      }
      const { newAuthorityId, reason } = parsed.data

      const row = await loadRow(req.params.id, actor, req)

      // Find new authority
      const targetAuth = AUTHORITIES.find(a => a.id === newAuthorityId)
      if (!targetAuth) {
        throw new HttpError('validation', 'The specified authority was not found.')
      }
      if (!targetAuth.active) {
        throw new HttpError('validation', 'The specified authority is inactive.')
      }

      // Verify the new authority belongs to the SAME department
      if (targetAuth.department !== row.department) {
        throw new HttpError('validation', `Reassignment must be to an authority in the same department (${row.department}).`)
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({
          authority_id:   targetAuth.id,
          authority_name: targetAuth.name,
          assigned_to_id: targetAuth.id,
          updated_at:     now,
        })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()

      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was concurrently modified.')

      await appendEvent(supabase, {
        appointmentId: row.id,
        action: 'forwarded',
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        summary: `Reassigned to ${targetAuth.name} by ${actor.name}. Reason: ${reason}`,
        detail: reason,
        visibleToRequester: true,
      })

      await recordAuditEvent({
        req,
        action: 'appointment_reassigned',
        entityType: 'appointment',
        entityId: row.id,
        outcome: 'success',
        before: { authorityId: row.authority_id, authorityName: row.authority_name },
        after: { authorityId: targetAuth.id, authorityName: targetAuth.name, reason },
      })

      const allowMeet = canViewMeetingUrl(actor, row)
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow, { includeMeetingUrl: allowMeet }) })
    } catch (err) {
      next(err)
    }
  },
)

export const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to reject a request.'),
}).strict()

// POST /appointments/:id/reject — reason required
appointmentsRouter.post(
  '/:id/reject',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/reject', 'appointment.reject'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = reasonSchema.safeParse(req.body ?? {})
      if (!parsed.success) {
        throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'A reason is required.')
      }
      const row = await loadRow(req.params.id, actor)
      assertTransitionOrThrow(row.status, 'rejected', actor.role)

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'rejected', assigned_stage: 'Rejected', updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

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
  },
)

export const messageSchema = z.object({
  message: z.string().trim().min(1, 'Describe what information is needed.'),
}).strict()

// POST /appointments/:id/request-info
appointmentsRouter.post(
  '/:id/request-info',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/request-info', 'appointment.requestInfo'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = messageSchema.safeParse(req.body ?? {})
      if (!parsed.success) {
        throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'A message is required.')
      }
      const row = await loadRow(req.params.id, actor)
      assertTransitionOrThrow(row.status, 'additional-info', actor.role)

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'additional-info', assigned_stage: 'Awaiting requester', updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

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
  },
)

// POST /appointments/:id/confirm
appointmentsRouter.post(
  '/:id/confirm',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/confirm', 'appointment.confirm'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)
      if (row.status === 'confirmed') {
        throw new HttpError('duplicate', 'This appointment is already confirmed.')
      }
      if (!row.date || !row.time) {
        throw new HttpError('illegal_transition', 'A date and time must be set before confirming.')
      }
      assertTransitionOrThrow(row.status, 'confirmed', actor.role)

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const meetUrl = (row.location_label && row.location_label.startsWith('http'))
        ? row.location_label
        : (row.mode === 'online' ? generateGoogleMeetLink(row.id) : '')

      const updateObj: Record<string, unknown> = {
        status: 'confirmed',
        assigned_stage: 'Confirmed',
        updated_at: now,
      }
      if (meetUrl && !row.location_label) {
        updateObj.location_label = meetUrl
      }

      const { data, error } = await supabase
        .from('appointments')
        .update(updateObj)
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'confirmed',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Confirmed by ${actor.name}.`,
        fromStatus: row.status, toStatus: 'confirmed',
      })

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'notification-sent',
        actorId: 'system', actorName: 'System', actorRole: 'system',
        summary: 'Confirmation sent to the requester by website and email.',
        detail: `Appointment confirmed for ${row.date} at ${row.time}.`,
      })

      const allowMeet = canViewMeetingUrl(actor, row)
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow, { includeMeetingUrl: allowMeet }) })
    } catch (err) {
      next(err)
    }
  },
)

// GET /appointments/:id/timeline — internal remarks never returned to requester
appointmentsRouter.get(
  '/:id/timeline',
  requireAuth(),
  declarePermission('GET', '/appointments/:id/timeline', ['appointment.viewOwn', 'appointment.viewAssigned']),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)

      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('audit_events')
        .select(AUDIT_COLUMNS)
        .eq('appointment_id', row.id)
        .order('timestamp', { ascending: true })
      if (error) throw new HttpError('internal_error', error.message)

      let rows = (data ?? []) as unknown as AuditRow[]
      if (actor.role === 'requester') {
        // Strict filtering: requesters never see internal remarks
        rows = rows.filter(r => r.visible_to_requester === true)
      }
      res.json({ timeline: rows.map(toTimelineDto) })
    } catch (err) {
      next(err)
    }
  },
)

// POST /appointments/:id/check-in
appointmentsRouter.post(
  '/:id/check-in',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/check-in', 'visitor.checkIn'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)
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
        .is('checked_in_at', null)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was already checked in.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'checked-in',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Visitor checked in by ${actor.name}.`,
      })

      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

// POST /appointments/:id/check-out
appointmentsRouter.post(
  '/:id/check-out',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/check-out', 'visitor.checkOut'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)
      if (!row.checked_in_at) {
        throw new HttpError('illegal_transition', 'The visitor must be checked in before checking out.')
      }
      if (row.checked_out_at) {
        throw new HttpError('duplicate', 'This visitor has already been checked out.')
      }
      assertTransitionOrThrow(row.status, 'completed', actor.role)

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ checked_out_at: now, status: 'completed', assigned_stage: 'Completed', updated_at: now })
        .eq('id', row.id)
        .is('checked_out_at', null)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was already checked out.')

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
  },
)

// POST /appointments/:id/not-reported
appointmentsRouter.post(
  '/:id/not-reported',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/not-reported', 'appointment.markNotReported'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)
      assertTransitionOrThrow(row.status, 'not-reported', actor.role)

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'not-reported', assigned_stage: 'Not reported', updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

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
  },
)

// POST /appointments/sweep-no-shows
appointmentsRouter.post(
  '/sweep-no-shows',
  requireAuth(),
  declarePermission('POST', '/appointments/sweep-no-shows', 'appointment.markNotReported'),
  async (_req, res, next) => {
    try {
      const result = await sweepNoShows(getSupabase())
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /appointments/:id/notifications
appointmentsRouter.get(
  '/:id/notifications',
  requireAuth(),
  declarePermission('GET', '/appointments/:id/notifications', ['appointment.viewOwn', 'appointment.viewAssigned']),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)

      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('audit_events')
        .select(AUDIT_COLUMNS)
        .eq('appointment_id', row.id)
        .eq('action', 'notification-sent')
        .order('timestamp', { ascending: true })
      if (error) throw new HttpError('internal_error', error.message)

      const rows = (data ?? []) as unknown as AuditRow[]
      res.json({ notifications: rows.map(toTimelineDto) })
    } catch (err) {
      next(err)
    }
  },
)

export const forwardSchema = z.object({
  toRole:        z.enum(ROLES as [Role, ...Role[]]),
  toAuthorityId: z.string().trim().optional(),
  reason:        z.string().trim().min(1, 'A reason is required to reassign this request.'),
}).strict()

// POST /appointments/:id/forward — reassignments restricted to same department
appointmentsRouter.post(
  '/:id/forward',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/forward', 'appointment.forward'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = forwardSchema.safeParse(req.body ?? {})
      if (!parsed.success) {
        throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Choose a role and provide a reason.')
      }
      const row = await loadRow(req.params.id, actor)

      // Department restriction: reassignment only within same department
      if (parsed.data.toAuthorityId) {
        const targetAuth = AUTHORITIES.find(a => a.id === parsed.data.toAuthorityId)
        if (targetAuth && targetAuth.department !== row.department) {
          throw new HttpError('validation', 'Reassignment is only allowed within the same department.')
        }
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({
          assigned_role:  parsed.data.toRole,
          assigned_to_id: parsed.data.toAuthorityId ?? row.assigned_to_id,
          assigned_stage: 'Forwarded for approval',
          updated_at:     now,
        })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'forwarded',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Forwarded to ${parsed.data.toRole} by ${actor.name}.`,
        detail: `Reason: ${parsed.data.reason}`,
      })
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

export const remarkSchema = z.object({
  text: z.string().trim().min(1, 'Enter a remark.'),
}).strict()

// POST /appointments/:id/internal-remark — visibleToRequester: false
appointmentsRouter.post(
  '/:id/internal-remark',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/internal-remark', 'appointment.internalRemark'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = remarkSchema.safeParse(req.body ?? {})
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Enter a remark.')
      const row = await loadRow(req.params.id, actor)

      const supabase = getSupabase()
      await appendEvent(supabase, {
        appointmentId: row.id, action: 'internal-remark',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Internal remark by ${actor.name}.`, detail: parsed.data.text,
        visibleToRequester: false,
      })

      const { data, error } = await supabase
        .from('audit_events')
        .select(AUDIT_COLUMNS)
        .eq('appointment_id', row.id)
        .eq('action', 'internal-remark')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      res.status(201).json({ event: data ? toTimelineDto(data as unknown as AuditRow) : null })
    } catch (err) {
      next(err)
    }
  },
)

export const proposeSchema = z.object({
  proposedDate: z.string().trim().min(1, 'A new date is required.'),
  proposedTime: z.string().trim().min(1, 'A new time is required.'),
  note:         z.string().trim().optional(),
}).strict()

// POST /appointments/:id/propose-reschedule
appointmentsRouter.post(
  '/:id/propose-reschedule',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/propose-reschedule', 'appointment.proposeReschedule'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = proposeSchema.safeParse(req.body ?? {})
      if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'A new date and time are required.')
      const row = await loadRow(req.params.id, actor)
      assertTransitionOrThrow(row.status, 'rescheduled', actor.role)

      const { proposedDate, proposedTime, note } = parsed.data
      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'rescheduled', proposed_date: proposedDate, proposed_time: proposedTime, assigned_stage: 'Awaiting requester', updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'reschedule-proposed',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Reschedule proposed by ${actor.name}.`,
        detail: `New slot proposed: ${proposedDate} at ${proposedTime}.${note ? ` ${note}` : ''}`,
        fromStatus: row.status, toStatus: 'rescheduled',
      })
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

export const respondSchema = z.object({
  decision: z.enum(['accept', 'decline']),
}).strict()

// POST /appointments/:id/respond-reschedule
appointmentsRouter.post(
  '/:id/respond-reschedule',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/respond-reschedule', 'appointment.respondReschedule'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = respondSchema.safeParse(req.body ?? {})
      if (!parsed.success) throw new HttpError('validation', 'Choose accept or decline.')
      const row = await loadRow(req.params.id, actor)
      if (row.status !== 'rescheduled') {
        throw new HttpError('illegal_transition', 'There is no pending reschedule to respond to.')
      }

      const supabase = getSupabase()
      const now = new Date().toISOString()
      if (parsed.data.decision === 'accept') {
        assertTransitionOrThrow(row.status, 'confirmed', actor.role)
        const { data, error } = await supabase
          .from('appointments')
          .update({
            status: 'confirmed', assigned_stage: 'Confirmed',
            date: row.proposed_date, time: row.proposed_time,
            proposed_date: null, proposed_time: null, updated_at: now,
          })
          .eq('id', row.id)
          .eq('status', row.status)
          .select(APPOINTMENT_COLUMNS)
          .maybeSingle()
        if (error) throw new HttpError('internal_error', error.message)
        if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

        await appendEvent(supabase, {
          appointmentId: row.id, action: 'reschedule-accepted',
          actorId: actor.id, actorName: actor.name, actorRole: actor.role,
          summary: `New schedule accepted by ${actor.name}.`,
          fromStatus: 'rescheduled', toStatus: 'confirmed',
        })
        const allowMeet = canViewMeetingUrl(actor, data as unknown as AppointmentRow)
        return res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow, { includeMeetingUrl: allowMeet }) })
      }

      assertTransitionOrThrow(row.status, 'cancelled', actor.role)
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', assigned_stage: 'Cancelled', proposed_date: null, proposed_time: null, updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'reschedule-declined',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `New schedule declined by ${actor.name}.`,
        fromStatus: 'rescheduled', toStatus: 'cancelled',
      })
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

// POST /appointments/:id/cancel
appointmentsRouter.post(
  '/:id/cancel',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/cancel', ['appointment.cancel', 'appointment.requestCancel']),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = reasonSchema.safeParse(req.body ?? {})
      if (!parsed.success) throw new HttpError('validation', 'A reason is required to cancel.')
      const row = await loadRow(req.params.id, actor)
      assertTransitionOrThrow(row.status, 'cancelled', actor.role)

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', assigned_stage: 'Cancelled', updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'cancelled',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Cancelled by ${actor.name}.`, detail: parsed.data.reason,
        fromStatus: row.status, toStatus: 'cancelled',
      })
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

// POST /appointments/:id/provide-info
appointmentsRouter.post(
  '/:id/provide-info',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/provide-info', 'appointment.provideInfo'),
  async (req, res, next) => {
    try {
      const actor = req.actor!
      const parsed = messageSchema.safeParse(req.body ?? {})
      if (!parsed.success) throw new HttpError('validation', 'Enter the requested information before sending.')
      const row = await loadRow(req.params.id, actor)
      if (row.status !== 'additional-info') {
        throw new HttpError('illegal_transition', 'No information was requested for this appointment.')
      }
      assertTransitionOrThrow(row.status, 'submitted', actor.role)

      const supabase = getSupabase()
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'submitted', assigned_stage: 'Authority review', updated_at: now })
        .eq('id', row.id)
        .eq('status', row.status)
        .select(APPOINTMENT_COLUMNS)
        .maybeSingle()
      if (error) throw new HttpError('internal_error', error.message)
      if (!data) throw new HttpError('conflict', 'This appointment was modified concurrently.')

      await appendEvent(supabase, {
        appointmentId: row.id, action: 'info-provided',
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        summary: `Information provided by ${actor.name}.`, detail: parsed.data.message,
        fromStatus: 'additional-info', toStatus: 'submitted',
      })
      res.json({ appointment: toAppointmentDto(data as unknown as AppointmentRow) })
    } catch (err) {
      next(err)
    }
  },
)

// Upload rate limiter: 10 uploads per minute per user/IP
const uploadRateLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'test' ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many upload attempts. Try again in a minute.' } },
})

// POST /appointments/:id/documents — streaming upload with magic byte inspection and virus scanning
appointmentsRouter.post(
  '/:id/documents',
  requireAuth(),
  declarePermission('POST', '/appointments/:id/documents', ['appointment.create', 'appointment.provideInfo', 'appointment.viewAssigned']),
  uploadRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)

      // Only requester or assigned authority can upload documents to this appointment
      if (actor.role === 'requester' && row.requester_id !== actor.id) {
        throw new HttpError('forbidden', 'You can only upload documents to your own appointment.')
      }

      const doc = await handleStreamingUpload(req, row.id, actor)

      await recordAuditEvent({
        req,
        action: 'document_uploaded',
        entityType: 'document',
        entityId: doc.id,
        outcome: 'success',
        after: { appointmentId: row.id, filename: doc.sanitizedName, size: doc.fileSize },
      })

      res.status(201).json({
        ok: true,
        document: {
          id: doc.id,
          appointmentId: doc.appointmentId,
          filename: doc.sanitizedName,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          status: doc.status,
          createdAt: doc.createdAt,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// GET /appointments/:id/documents/:docId — authorized document download with record-level check
appointmentsRouter.get(
  '/:id/documents/:docId',
  requireAuth(),
  declarePermission('GET', '/appointments/:id/documents/:docId', ['appointment.viewOwn', 'appointment.viewAssigned']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      const row = await loadRow(req.params.id, actor)

      const docRecord = getDocumentRecord(req.params.docId)
      if (docRecord) {
        if (docRecord.appointmentId !== row.id) {
          throw new HttpError('not_found', 'Document not found.')
        }
        if (docRecord.status === 'blocked') {
          throw new HttpError('forbidden', 'Document was blocked by virus scanner.')
        }
        if (docRecord.status === 'pending') {
          throw new HttpError('conflict', 'Document is still being scanned for viruses.')
        }
        if (!fs.existsSync(docRecord.storagePath)) {
          throw new HttpError('not_found', 'Document file not found on disk.')
        }

        await recordAuditEvent({
          req,
          action: 'document_downloaded',
          entityType: 'document',
          entityId: docRecord.id,
          outcome: 'success',
          before: { appointmentId: row.id, requesterId: row.requester_id },
        })

        res.setHeader('Content-Type', docRecord.mimeType)
        res.setHeader('Content-Disposition', `attachment; filename="${docRecord.sanitizedName}"`)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cache-Control', 'private, no-store')
        return fs.createReadStream(docRecord.storagePath).pipe(res)
      }

      // Fallback for seed mock documents
      await recordAuditEvent({
        req,
        action: 'document_downloaded',
        entityType: 'document',
        entityId: req.params.docId,
        outcome: 'success',
        before: { appointmentId: row.id, requesterId: row.requester_id },
      })

      const filename = `appointment-${row.id}-doc-${req.params.docId}.pdf`
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'private, no-store')
      res.send(Buffer.from(`%PDF-1.4\n% Secure Document ${req.params.docId} for Appointment ${row.id}\n%%EOF`))
    } catch (err) {
      next(err)
    }
  },
)

export function __resetAppointmentsIdempotencyCache(): void {
  IDEMPOTENCY_CACHE.clear()
}
