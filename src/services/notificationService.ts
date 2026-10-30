// ─── Notification Service ───────────────────────────────────────────────────
// Provides genuine, non-seeded in-app notifications for the logged-in customer/user.
// Scoped to the user's actual appointments and status updates.
// No fake or mock notifications are returned to the user.

import { api } from './apiClient'
import { fetchAllAppointments, localISODate, type AppointmentRecord } from '../data/mockAppointments'
import type { Role } from '../config/permissions'

export interface InAppNotification {
  id: string
  appointmentId?: string
  title: string
  message: string
  time: string
  timestamp: string
  read: boolean
  type: 'approved' | 'confirmed' | 'reminder' | 'info' | 'submitted' | 'cancelled' | 'rejected' | 'general'
}

export function formatRelativeTime(dateInput: string | Date | number): string {
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput
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

function getReadNotificationIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`read_notifications_${userId}`)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export function markNotificationAsRead(userId: string, notificationId: string): void {
  try {
    const set = getReadNotificationIds(userId)
    set.add(notificationId)
    localStorage.setItem(`read_notifications_${userId}`, JSON.stringify(Array.from(set)))
  } catch {}
}

export function markAllNotificationsAsRead(userId: string, notificationIds: string[]): void {
  try {
    const set = getReadNotificationIds(userId)
    notificationIds.forEach(id => set.add(id))
    localStorage.setItem(`read_notifications_${userId}`, JSON.stringify(Array.from(set)))
  } catch {}
}

export async function fetchUserNotifications(user: {
  id?: string
  name?: string
  role?: Role
  email?: string
} | null): Promise<InAppNotification[]> {
  if (!user || !user.id) return []

  // Check user notification preferences
  try {
    const rawPrefs = localStorage.getItem('portal_preferences')
    if (rawPrefs) {
      const prefs = JSON.parse(rawPrefs)
      if (prefs.notifyInApp === false) {
        return []
      }
    }
  } catch {}

  const readSet = getReadNotificationIds(user.id)

  // 1. Try fetching from backend if live API is enabled
  const isSupabase = import.meta.env.VITE_DATA_SOURCE === 'supabase'
  if (isSupabase) {
    try {
      const res = await api.get<{ notifications: InAppNotification[] }>('/notifications')
      if (res && Array.isArray(res.notifications)) {
        return res.notifications.map(n => ({
          ...n,
          read: n.read || readSet.has(n.id),
        }))
      }
    } catch {
      // Fall through to local derivation if network or backend fails
    }
  }

  // 2. Local scoped derivation from actual appointments belonging to this customer
  const viewer = { id: user.id, name: user.name, role: user.role ?? 'requester' }
  const appointments: AppointmentRecord[] = await fetchAllAppointments(viewer)

  // If user has no appointments, return empty list (never invent fake notifications)
  if (!appointments || appointments.length === 0) {
    return []
  }

  const notifications: InAppNotification[] = []
  const today = localISODate()

  for (const appt of appointments) {
    const isCustomer = user.role === 'requester'

    // Status notification
    if (appt.status === 'approved') {
      notifications.push({
        id: `notif-${appt.id}-approved`,
        appointmentId: appt.id,
        title: 'Appointment approved',
        message: isCustomer
          ? `Your appointment with ${appt.authority} has been approved.`
          : `Appointment for ${appt.requester} has been approved.`,
        time: formatRelativeTime(appt.createdAt),
        timestamp: appt.createdAt,
        read: readSet.has(`notif-${appt.id}-approved`),
        type: 'approved',
      })
    } else if (appt.status === 'confirmed') {
      notifications.push({
        id: `notif-${appt.id}-confirmed`,
        appointmentId: appt.id,
        title: 'Appointment confirmed',
        message: isCustomer
          ? `Your appointment with ${appt.authority} is confirmed for ${appt.date} at ${appt.time}.`
          : `Appointment with ${appt.requester} is confirmed for ${appt.date} at ${appt.time}.`,
        time: formatRelativeTime(appt.createdAt),
        timestamp: appt.createdAt,
        read: readSet.has(`notif-${appt.id}-confirmed`),
        type: 'confirmed',
      })
    } else if (appt.status === 'additional-info') {
      notifications.push({
        id: `notif-${appt.id}-info`,
        appointmentId: appt.id,
        title: 'Additional information required',
        message: isCustomer
          ? `Please provide additional details requested for your appointment with ${appt.authority}.`
          : `Additional information requested from ${appt.requester}.`,
        time: formatRelativeTime(appt.createdAt),
        timestamp: appt.createdAt,
        read: readSet.has(`notif-${appt.id}-info`),
        type: 'info',
      })
    } else if (appt.status === 'rescheduled') {
      notifications.push({
        id: `notif-${appt.id}-rescheduled`,
        appointmentId: appt.id,
        title: 'Reschedule proposed',
        message: isCustomer
          ? `A new slot has been proposed for your appointment with ${appt.authority}.`
          : `Reschedule proposed for ${appt.requester}.`,
        time: formatRelativeTime(appt.createdAt),
        timestamp: appt.createdAt,
        read: readSet.has(`notif-${appt.id}-rescheduled`),
        type: 'info',
      })
    } else if (appt.status === 'submitted') {
      if (isCustomer) {
        notifications.push({
          id: `notif-${appt.id}-submitted`,
          appointmentId: appt.id,
          title: 'Appointment request submitted',
          message: `Your appointment request (${appt.id}) for ${appt.purpose || appt.appointmentType} has been submitted.`,
          time: formatRelativeTime(appt.createdAt),
          timestamp: appt.createdAt,
          read: readSet.has(`notif-${appt.id}-submitted`),
          type: 'submitted',
        })
      } else {
        notifications.push({
          id: `notif-${appt.id}-request`,
          appointmentId: appt.id,
          title: 'New appointment request',
          message: `${appt.requester} has requested an appointment with you.`,
          time: formatRelativeTime(appt.createdAt),
          timestamp: appt.createdAt,
          read: readSet.has(`notif-${appt.id}-request`),
          type: 'submitted',
        })
      }
    } else if (appt.status === 'cancelled' || appt.status === 'rejected') {
      const isCancel = appt.status === 'cancelled'
      notifications.push({
        id: `notif-${appt.id}-${appt.status}`,
        appointmentId: appt.id,
        title: isCancel ? 'Appointment cancelled' : 'Appointment rejected',
        message: `Your appointment (${appt.id}) with ${appt.authority} was ${appt.status}.`,
        time: formatRelativeTime(appt.createdAt),
        timestamp: appt.createdAt,
        read: readSet.has(`notif-${appt.id}-${appt.status}`),
        type: isCancel ? 'cancelled' : 'rejected',
      })
    }

    // Reminder notification for today
    if (appt.date === today && (appt.status === 'confirmed' || appt.status === 'approved')) {
      const reminderId = `notif-${appt.id}-today-reminder`
      const who = isCustomer ? appt.authority : appt.requester
      notifications.unshift({
        id: reminderId,
        appointmentId: appt.id,
        title: 'Appointment reminder',
        message: `Meeting with ${who} at ${appt.time} today.`,
        time: 'Today',
        timestamp: new Date().toISOString(),
        read: readSet.has(reminderId),
        type: 'reminder',
      })
    }
  }

  // Sort newest first
  return notifications.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
