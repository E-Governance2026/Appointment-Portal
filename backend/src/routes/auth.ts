import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { getSupabaseAnon } from '../lib/supabase.js'
import { HttpError } from '../lib/httpError.js'
import { actorFromToken, requireAuth } from '../middleware/auth.js'

// ─── Auth routes ──────────────────────────────────────────────────────────────
export const authRouter = Router()

const loginSchema = z.object({
  email:    z.string().email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
})

// POST /auth/login — email + password → { token, actor }.
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Invalid login details.')
    }
    const { email, password } = parsed.data

    const supabase = getSupabaseAnon()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      throw new HttpError('unauthorized', 'Email or password is incorrect.')
    }

    const token = data.session.access_token
    const actor = await actorFromToken(token)

    res.json({
      token,
      expiresAt: data.session.expires_at,
      actor,
    })
  } catch (err) {
    next(err)
  }
})

// GET /me — the actor for the current session.
authRouter.get('/me', requireAuth(), (req: Request, res: Response) => {
  res.json({ actor: req.actor })
})
