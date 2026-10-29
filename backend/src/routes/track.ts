import { Router, type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { getSupabase } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { USERS } from '../seed/seedData.js'
import { recordAuditEvent } from '../lib/auditTrail.js'

// ─── Hardened Public Track Route ─────────────────────────────────────────────
// GET /track/:id — look up appointment status with 2nd factor verification.
// Rules:
// 1. IP rate limited (max 10 requests / minute) + ID rate limited (max 5 / 10 min)
// 2. Requires a second factor: requester email or employee ID
// 3. Generic "No matching appointment found." error (never leak ID existence)
// 4. Returns ONLY status and date (never names, documents, remarks, or meeting URLs)
export const trackRouter = Router()

// Rate limit by IP: 10 per minute (skip in test unless tested)
const trackIpLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === 'test' ? 100 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many tracking attempts. Try again in a minute.' } },
})

// Rate limit by Appointment ID: max 5 attempts per 10 minutes
const idAttempts = new Map<string, { count: number; windowStart: number }>()

function checkIdRateLimit(id: string): boolean {
  const now = Date.now()
  const rec = idAttempts.get(id) ?? { count: 0, windowStart: now }
  if (now - rec.windowStart > 10 * 60 * 1000) {
    rec.count = 1
    rec.windowStart = now
  } else {
    rec.count += 1
  }
  idAttempts.set(id, rec)
  return rec.count <= (process.env.NODE_ENV === 'test' ? 100 : 5)
}

trackRouter.get('/:id', trackIpLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id ?? '').trim()
    const identifier = String(
      req.query.identifier ??
      req.body?.identifier ??
      req.headers['x-requester-identifier'] ??
      '',
    ).trim().toLowerCase()

    // Second factor is strictly required to prevent guessing sequential IDs
    if (!identifier) {
      return res.status(400).json({
        error: {
          code: 'validation',
          message: 'Appointment reference and verification identifier (email or employee ID) are required.',
        },
      })
    }

    // Rate limit per appointment ID
    if (!checkIdRateLimit(id)) {
      return res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many verification attempts for this appointment. Please try again later.',
        },
      })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('appointments')
      .select('id, status, date, requester, requester_id')
      .eq('id', id)
      .maybeSingle()

    if (error) throw new HttpError('internal_error', error.message)

    // Constant generic error message for any mismatch
    const genericNotFound = () => {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(404).json({
        error: { code: 'not_found', message: 'No matching appointment found.' },
      })
    }

    if (!data) {
      return genericNotFound()
    }

    // Validate 2nd factor: match against requester user profile
    let matched = false
    const requesterUser = USERS.find(
      u => u.id === data.requester_id || u.name.toLowerCase() === data.requester.toLowerCase(),
    )

    if (requesterUser) {
      const emailMatch = requesterUser.email.toLowerCase() === identifier
      const empIdMatch = requesterUser.employee_id.toLowerCase() === identifier
      matched = emailMatch || empIdMatch
    }

    // Fallback: check Supabase users table if present
    if (!matched && data.requester_id) {
      try {
        const { data: userRow } = await supabase
          .from('users')
          .select('email, employee_id')
          .eq('id', data.requester_id)
          .maybeSingle()

        if (userRow) {
          const emailMatch = userRow.email?.toLowerCase() === identifier
          const empIdMatch = userRow.employee_id?.toLowerCase() === identifier
          matched = emailMatch || empIdMatch
        }
      } catch {
        // user check failure
      }
    }

    if (!matched) {
      return genericNotFound()
    }

    // Audit tracking event
    recordAuditEvent({
      action: 'appointment_tracked_public',
      entityType: 'appointment',
      entityId: data.id,
      outcome: 'success',
      req,
    }).catch(() => {})

    // Return strictly status and date — NO names, NO documents, NO remarks, NO meeting URLs
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      appointment: {
        id:     data.id,
        status: data.status,
        date:   data.date ?? '',
      },
    })
  } catch (err) {
    next(err)
  }
})

export function __resetTrackRateLimits(): void {
  idAttempts.clear()
}
