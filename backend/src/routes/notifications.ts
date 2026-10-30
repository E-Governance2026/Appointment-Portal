// ─── User Notifications Router ───────────────────────────────────────────────
// Returns genuine, non-seeded in-app notifications for the authenticated user.
// Scoped to the user's actual appointments and timeline events.
// Requesters only see notifications for their own appointments.

import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { declarePermission, registerRoutePermission } from '../middleware/permission.js'
import { getSupabase } from '../lib/supabase.js'
import { isSupabaseConfigured } from '../config/env.js'
import { HttpError } from '../lib/httpError.js'
import { sanitizePostgrestFilter } from '../lib/sanitizer.js'

export const notificationsRouter = Router()
registerRoutePermission('GET', '/api/notifications', 'appointment.viewOwn')

export interface BackendNotificationDto {
  id: string
  appointmentId: string
  title: string
  message: string
  time: string
  timestamp: string
  read: boolean
  type: 'approved' | 'confirmed' | 'reminder' | 'info' | 'submitted' | 'cancelled' | 'rejected' | 'general'
}

function formatRelativeTime(isoDate: string): string {
  const d = new Date(isoDate)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)

  if (isNaN(diffSec) || diffSec < 60) return 'Just now'
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60)
    return `${mins} min${mins > 1 ? 's' : ''} ago`
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600)
    return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  }
  if (diffSec < 172800) return 'Yesterday'
  const days = Math.floor(diffSec / 86400)
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// GET /notifications (and /api/notifications)
notificationsRouter.get(
  '/',
  requireAuth(),
  declarePermission('GET', '/notifications', 'appointment.viewOwn'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.actor!
      if (!isSupabaseConfigured()) {
        // When Supabase is not configured, return empty list (no fake seeded data)
        return res.json({ notifications: [] })
      }

      const supabase = getSupabase()

      // 1. Fetch appointments relevant to this actor
      let apptQuery = supabase
        .from('appointments')
        .select('id, requester, requester_id, authority_name, department, date, time, status, purpose_label, subject, created_at, updated_at')

      if (actor.role === 'requester') {
        const safeId = sanitizePostgrestFilter(actor.id)
        const safeEmail = sanitizePostgrestFilter(actor.email)
        apptQuery = apptQuery.or(`requester_id.eq.${safeId},requester_email.eq.${safeEmail}`)
      } else if (actor.role === 'coordinator_authority') {
        const safeId = sanitizePostgrestFilter(actor.id)
        apptQuery = apptQuery.or(`assigned_to_id.eq.${safeId},assigned_role.eq.${actor.role}`)
      }
      // admin_dispatcher and super_admin see recent appointments

      const { data: apptRows, error: apptError } = await apptQuery.order('created_at', { ascending: false }).limit(20)
      if (apptError) {
        throw new HttpError('internal_error', apptError.message)
      }

      const appointments = apptRows ?? []
      if (appointments.length === 0) {
        return res.json({ notifications: [] })
      }

      const apptIds = appointments.map(a => a.id)
      const apptMap = new Map(appointments.map(a => [a.id, a]))

      // 2. Fetch audit events for these appointments
      let auditQuery = supabase
        .from('audit_events')
        .select('id, appointment_id, action, actor_name, summary, detail, timestamp, visible_to_requester')
        .in('appointment_id', apptIds)
        .order('timestamp', { ascending: false })
        .limit(30)

      if (actor.role === 'requester') {
        auditQuery = auditQuery.eq('visible_to_requester', true)
      }

      const { data: eventRows, error: auditError } = await auditQuery
      if (auditError) {
        throw new HttpError('internal_error', auditError.message)
      }

      const events = eventRows ?? []
      const notifications: BackendNotificationDto[] = []
      const seenKeys = new Set<string>()

      for (const evt of events) {
        const appt = apptMap.get(evt.appointment_id)
        if (!appt) continue

        let type: BackendNotificationDto['type'] = 'general'
        let title = 'Appointment update'
        let message = evt.summary || 'Your appointment has been updated.'

        if (evt.action === 'approved') {
          type = 'approved'
          title = 'Appointment approved'
          message = `Your appointment with ${appt.authority_name || 'the authority'} has been approved.`
        } else if (evt.action === 'confirmed') {
          type = 'confirmed'
          title = 'Appointment confirmed'
          message = `Your appointment with ${appt.authority_name || 'the authority'} is confirmed for ${appt.date || ''} at ${appt.time || ''}.`
        } else if (evt.action === 'info-requested') {
          type = 'info'
          title = 'Additional information required'
          message = evt.detail || `Additional details requested for appointment ${appt.id}.`
        } else if (evt.action === 'reschedule-proposed') {
          type = 'info'
          title = 'Reschedule proposed'
          message = evt.detail || `A new time slot has been proposed for appointment ${appt.id}.`
        } else if (evt.action === 'cancelled' || evt.action === 'rejected') {
          type = 'cancelled'
          title = evt.action === 'cancelled' ? 'Appointment cancelled' : 'Appointment rejected'
          message = evt.detail || `Appointment ${appt.id} was ${evt.action}.`
        } else if (evt.action === 'submitted') {
          type = 'submitted'
          if (actor.role === 'requester') {
            title = 'Appointment submitted'
            message = `Your appointment request for ${appt.purpose_label || appt.subject || 'consultation'} has been submitted.`
          } else {
            title = 'New appointment request'
            message = `${appt.requester} has requested an appointment.`
          }
        }

        const dedupKey = `${evt.appointment_id}-${type}`
        if (!seenKeys.has(dedupKey)) {
          seenKeys.add(dedupKey)
          notifications.push({
            id: `evt-${evt.id}`,
            appointmentId: evt.appointment_id,
            title,
            message,
            time: formatRelativeTime(evt.timestamp),
            timestamp: evt.timestamp,
            read: false,
            type,
          })
        }
      }

      // 3. Add same-day reminders for confirmed/approved appointments
      const today = new Date().toISOString().slice(0, 10)
      for (const appt of appointments) {
        if (appt.date === today && (appt.status === 'confirmed' || appt.status === 'approved')) {
          const reminderKey = `rem-${appt.id}-${today}`
          if (!seenKeys.has(reminderKey)) {
            seenKeys.add(reminderKey)
            const who = actor.role === 'requester' ? (appt.authority_name || 'the authority') : appt.requester
            notifications.unshift({
              id: reminderKey,
              appointmentId: appt.id,
              title: 'Appointment reminder',
              message: `Meeting with ${who} at ${appt.time || 'scheduled time'} today.`,
              time: 'Today',
              timestamp: new Date().toISOString(),
              read: false,
              type: 'reminder',
            })
          }
        }
      }

      res.json({ notifications: notifications.slice(0, 15) })
    } catch (err) {
      next(err)
    }
  },
)
