import { Router, type Request, type Response, type NextFunction } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'

// ─── Public track route ───────────────────────────────────────────────────────
// GET /track/:id — look up an appointment's public status by its reference id.
// UNAUTHENTICATED by design: a requester tracks a request without signing in,
// using only the reference they were given. Returns a minimal, non-sensitive
// view (no requester PII, no internal notes) — just what the track screen shows.
export const trackRouter = Router()

trackRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('appointments')
      .select('id, status, purpose_label, type_name, department, authority_name, date, time, submitted_at')
      .eq('id', req.params.id)
      .maybeSingle()
    if (error) throw new HttpError('internal_error', error.message)
    if (!data) throw new HttpError('not_found', `No appointment found for reference ${req.params.id}.`)

    res.json({
      appointment: {
        id:            data.id,
        status:        data.status,
        purposeLabel:  data.purpose_label ?? '',
        typeName:      data.type_name ?? '',
        department:    data.department ?? '',
        authorityName: data.authority_name ?? '',
        date:          data.date ?? '',
        time:          data.time ?? '',
        submittedAt:   data.submitted_at,
      },
    })
  } catch (err) {
    next(err)
  }
})
