// ─── Email Notification Service ───────────────────────────────────────────────
// Simulates and persists automated email notifications sent to requesters upon
// appointment confirmation, including Google Meet link and Google Calendar reminder.

import type { ApprovalRecord } from '../data/approvalData'
import { googleCalendarUrl } from '../utils/calendar'
import { generateGoogleMeetLink, getAppointmentMeetLink } from '../utils/googleMeet'

export interface SentEmail {
  id: string
  appointmentId: string
  to: string
  recipientName: string
  from: string
  subject: string
  date: string
  time: string
  authorityName: string
  department: string
  appointmentSubject: string
  mode: 'physical' | 'online' | 'phone'
  meetingUrl?: string
  calendarUrl: string
  sentAt: string
}

const STORAGE_KEY = 'mis_sent_emails'

function loadSentEmails(): SentEmail[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SentEmail[]
  } catch {
    return []
  }
}

function saveSentEmails(list: SentEmail[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 50)))
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Returns the requester's university email based on their name.
 */
export function getRequesterEmail(name: string): string {
  const clean = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .join('.')
  return `${clean || 'requester'}@university.edu`
}

/**
 * Sends and records an automated confirmation email to the requester
 * with Google Meet link and Add to Google Calendar reminder.
 */
export function sendAppointmentConfirmationEmail(appointment: ApprovalRecord): SentEmail {
  const meetUrl = appointment.mode === 'online'
    ? (getAppointmentMeetLink(appointment) || generateGoogleMeetLink(appointment.id))
    : undefined

  const calUrl = googleCalendarUrl({
    title: `Appointment: ${appointment.subject}`,
    date: appointment.date,
    time: appointment.time,
    details: appointment.mode === 'online'
      ? `Online Video Consultation via Google Meet.\n\nJoin Google Meet: ${meetUrl}\nWith: ${appointment.authorityName} (${appointment.department})\nPurpose: ${appointment.subject}`
      : `Campus Appointment with ${appointment.authorityName} (${appointment.department}).\nLocation: ${appointment.locationLabel || 'Campus Office'}\nPurpose: ${appointment.subject}`,
    location: meetUrl || appointment.locationLabel || 'Parul University Campus',
    meetingUrl: meetUrl,
  }) || '#'

  const email: SentEmail = {
    id: `EMAIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    appointmentId: appointment.id,
    to: getRequesterEmail(appointment.requester),
    recipientName: appointment.requester,
    from: 'appointments-noreply@paruluniversity.ac.in',
    subject: appointment.mode === 'online'
      ? `Confirmed: Online Consultation (${appointment.subject}) with ${appointment.authorityName}`
      : `Confirmed: Appointment (${appointment.subject}) with ${appointment.authorityName}`,
    date: appointment.date,
    time: appointment.time,
    authorityName: appointment.authorityName,
    department: appointment.department,
    appointmentSubject: appointment.subject,
    mode: appointment.mode,
    meetingUrl: meetUrl,
    calendarUrl: calUrl,
    sentAt: new Date().toISOString(),
  }

  const existing = loadSentEmails()
  // Replace existing email for this appointment if one was previously sent
  const filtered = existing.filter(e => e.appointmentId !== appointment.id)
  filtered.unshift(email)
  saveSentEmails(filtered)

  return email
}

/**
 * Retrieves the sent email for an appointment, or creates a preview on demand
 * if the appointment is already confirmed.
 */
export function getSentEmailForAppointment(appointment: ApprovalRecord): SentEmail | null {
  const list = loadSentEmails()
  const found = list.find(e => e.appointmentId === appointment.id)
  if (found) return found

  // If appointment is confirmed, synthesize the confirmation email
  if (appointment.status === 'confirmed' || appointment.status === 'approved') {
    return sendAppointmentConfirmationEmail(appointment)
  }
  return null
}
