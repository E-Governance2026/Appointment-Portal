import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { requireAuth } from '../middleware/auth.js'
import { hasPermission } from '../domain/permissions.js'
import {
  toAvailabilityDto, availabilityBodySchema,
  type AvailabilityRow, type WorkingHoursRow, type HolidayRow,
} from './availabilityMapper.js'

// ─── Availability routes ──────────────────────────────────────────────────────
// GET  /availability/:authorityId — read an authority's working hours, slot
//   length and holidays (reference read used by the booking flow).
// PUT  /availability/:authorityId — upsert the config. An authority may manage
//   only their own (calendar.manageOwn); admin_dispatcher / super_admin may
//   manage any (calendar.manageAny). Mirrors updateAvailability in the mock
//   service.
export const availabilityRouter = Router()

// Confirm an authority exists, else 404.
async function assertAuthorityExists(authorityId: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('authorities')
    .select('id')
    .eq('id', authorityId)
    .maybeSingle()
  if (error) throw new HttpError('internal_error', error.message)
  if (!data) throw new HttpError('not_found', `Authority ${authorityId} not found.`)
}

// GET /availability/:authorityId
availabilityRouter.get('/:authorityId', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { authorityId } = req.params
    await assertAuthorityExists(authorityId)
    const supabase = getSupabase()

    const [av, wh, hol] = await Promise.all([
      supabase.from('availability').select('authority_id, slot_minutes').eq('authority_id', authorityId).maybeSingle(),
      supabase.from('working_hours').select('authority_id, weekday, enabled, start_time, end_time').eq('authority_id', authorityId).order('weekday', { ascending: true }),
      supabase.from('holidays').select('authority_id, date, label').eq('authority_id', authorityId).order('date', { ascending: true }),
    ])
    if (av.error)  throw new HttpError('internal_error', av.error.message)
    if (wh.error)  throw new HttpError('internal_error', wh.error.message)
    if (hol.error) throw new HttpError('internal_error', hol.error.message)

    const dto = toAvailabilityDto(
      authorityId,
      (av.data as AvailabilityRow | null) ?? null,
      (wh.data ?? []) as WorkingHoursRow[],
      (hol.data ?? []) as HolidayRow[],
    )
    res.json({ availability: dto })
  } catch (err) {
    next(err)
  }
})

// PUT /availability/:authorityId
availabilityRouter.put('/:authorityId', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!
    const { authorityId } = req.params

    // Permission: manage any, or manage own when this is the actor's record.
    const canAny = hasPermission(actor.role, 'calendar.manageAny')
    const canOwn = hasPermission(actor.role, 'calendar.manageOwn') && authorityId === actor.id
    if (!canAny && !canOwn) {
      throw new HttpError('forbidden', 'You do not have permission to change this availability.')
    }

    const parsed = availabilityBodySchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid availability.')
    }
    const body = parsed.data

    await assertAuthorityExists(authorityId)
    const supabase = getSupabase()

    // Upsert the availability row (slot length).
    const upAv = await supabase
      .from('availability')
      .upsert({ authority_id: authorityId, slot_minutes: body.slotMinutes }, { onConflict: 'authority_id' })
    if (upAv.error) throw new HttpError('internal_error', upAv.error.message)

    // Replace working_hours: delete the 7 rows then insert the new set.
    const delWh = await supabase.from('working_hours').delete().eq('authority_id', authorityId)
    if (delWh.error) throw new HttpError('internal_error', delWh.error.message)
    const insWh = await supabase.from('working_hours').insert(
      body.workingHours.map(w => ({
        authority_id: authorityId, weekday: w.weekday, enabled: w.enabled, start_time: w.start, end_time: w.end,
      })),
    )
    if (insWh.error) throw new HttpError('internal_error', insWh.error.message)

    // Replace holidays.
    const delHol = await supabase.from('holidays').delete().eq('authority_id', authorityId)
    if (delHol.error) throw new HttpError('internal_error', delHol.error.message)
    if (body.holidays.length > 0) {
      const insHol = await supabase.from('holidays').insert(
        body.holidays.map(h => ({ authority_id: authorityId, date: h.date, label: h.label })),
      )
      if (insHol.error) throw new HttpError('internal_error', insHol.error.message)
    }

    // Read back the saved config to return the canonical shape.
    const [av, wh, hol] = await Promise.all([
      supabase.from('availability').select('authority_id, slot_minutes').eq('authority_id', authorityId).maybeSingle(),
      supabase.from('working_hours').select('authority_id, weekday, enabled, start_time, end_time').eq('authority_id', authorityId).order('weekday', { ascending: true }),
      supabase.from('holidays').select('authority_id, date, label').eq('authority_id', authorityId).order('date', { ascending: true }),
    ])
    if (av.error || wh.error || hol.error) {
      throw new HttpError('internal_error', (av.error ?? wh.error ?? hol.error)!.message)
    }

    const dto = toAvailabilityDto(
      authorityId,
      (av.data as AvailabilityRow | null) ?? null,
      (wh.data ?? []) as WorkingHoursRow[],
      (hol.data ?? []) as HolidayRow[],
    )
    res.json({ availability: dto })
  } catch (err) {
    next(err)
  }
})
