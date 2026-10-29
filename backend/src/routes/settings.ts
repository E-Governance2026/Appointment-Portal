// ─── Application Settings & Integration Routes ──────────────────────────────
// Manages system settings and integration configurations (e.g. Google Calendar,
// Google Meet, email service). Changing integration settings is a sensitive
// action requiring recent authentication within the last 5 minutes.

import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireRecentAuth } from '../middleware/recentAuth.js'
import { declarePermission } from '../middleware/permission.js'
import { encryptAtRest } from '../lib/mfa.js'
import { recordAuditEvent } from '../lib/auditTrail.js'

export const settingsRouter = Router()

// In-memory settings state
interface IntegrationSettings {
  googleCalendarEnabled: boolean
  googleMeetEnabled:     boolean
  googleDomainAllowlist: string[]
  encryptedRefreshToken: string | null
  updatedAt:             string
}

let integrationSettings: IntegrationSettings = {
  googleCalendarEnabled: true,
  googleMeetEnabled:     true,
  googleDomainAllowlist: ['paruluniversity.ac.in', 'university.edu'],
  encryptedRefreshToken: null,
  updatedAt:             new Date().toISOString(),
}

const updateIntegrationSchema = z.object({
  googleCalendarEnabled: z.boolean().optional(),
  googleMeetEnabled:     z.boolean().optional(),
  googleDomainAllowlist: z.array(z.string()).optional(),
  refreshToken:          z.string().optional(),
}).strict()

// GET /settings/integrations (requires auth + permission)
settingsRouter.get(
  '/integrations',
  requireAuth(),
  declarePermission('GET', '/settings/integrations', 'master.manage'),
  (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      settings: {
        googleCalendarEnabled: integrationSettings.googleCalendarEnabled,
        googleMeetEnabled:     integrationSettings.googleMeetEnabled,
        googleDomainAllowlist: integrationSettings.googleDomainAllowlist,
        hasRefreshToken:       Boolean(integrationSettings.encryptedRefreshToken),
        updatedAt:             integrationSettings.updatedAt,
      },
    })
  },
)

// PUT /settings/integrations (super admin only, SENSITIVE ACTION: requires recent auth)
settingsRouter.put(
  '/integrations',
  requireAuth(),
  declarePermission('PUT', '/settings/integrations', 'master.manage'),
  requireRecentAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateIntegrationSchema.safeParse(req.body)
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: 'validation', message: parsed.error.issues[0]?.message ?? 'Invalid settings.' },
        })
      }
      const data = parsed.data
      const beforeState = { ...integrationSettings }

      if (data.googleCalendarEnabled !== undefined) {
        integrationSettings.googleCalendarEnabled = data.googleCalendarEnabled
      }
      if (data.googleMeetEnabled !== undefined) {
        integrationSettings.googleMeetEnabled = data.googleMeetEnabled
      }
      if (data.googleDomainAllowlist !== undefined) {
        integrationSettings.googleDomainAllowlist = data.googleDomainAllowlist
      }
      if (data.refreshToken) {
        // Encrypt refresh token at rest with AES-256-GCM using APP_ENCRYPTION_KEY
        integrationSettings.encryptedRefreshToken = encryptAtRest(data.refreshToken)
      }

      integrationSettings.updatedAt = new Date().toISOString()

      await recordAuditEvent({
        req,
        action: 'integration_settings_updated',
        entityType: 'settings',
        entityId: 'integrations',
        outcome: 'success',
        before: { googleCalendar: beforeState.googleCalendarEnabled, googleMeet: beforeState.googleMeetEnabled },
        after: { googleCalendar: integrationSettings.googleCalendarEnabled, googleMeet: integrationSettings.googleMeetEnabled },
      })

      res.setHeader('Cache-Control', 'no-store')
      res.json({
        success: true,
        message: 'Integration settings updated successfully.',
        settings: {
          googleCalendarEnabled: integrationSettings.googleCalendarEnabled,
          googleMeetEnabled:     integrationSettings.googleMeetEnabled,
          googleDomainAllowlist: integrationSettings.googleDomainAllowlist,
          hasRefreshToken:       Boolean(integrationSettings.encryptedRefreshToken),
          updatedAt:             integrationSettings.updatedAt,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

export function __resetIntegrationSettings(): void {
  integrationSettings = {
    googleCalendarEnabled: true,
    googleMeetEnabled:     true,
    googleDomainAllowlist: ['paruluniversity.ac.in', 'university.edu'],
    encryptedRefreshToken: null,
    updatedAt:             new Date().toISOString(),
  }
}
