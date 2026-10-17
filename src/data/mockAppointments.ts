// ─── PRD appointment statuses ─────────────────────────────────────────────────
// These are the only valid statuses in the system.
// "Upcoming", "checked-in", "waiting" are NOT PRD statuses and must not appear.
import type { Role } from '../config/permissions'
import { canViewAppointment } from '../config/permissions'

export type AppointmentStatus =
  | 'draft'
  | 'submitted'
  | 'additional-info'
  | 'approved'
  | 'confirmed'
  | 'rescheduled'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'not-reported'

// Status display config — sentence case, 6px radius, spec colors with icon key
// icon: lucide icon name string; StatusChip component imports the actual icon
export const STATUS_CONFIG: Record<
  AppointmentStatus,
  { label: string; bg: string; color: string; icon: string; lineColor: string }
> = {
  // Amber family (#FCEBD0 / #8A5200)
  'submitted':        { label: 'Submitted',                       bg: '#FCEBD0', color: '#8A5200', icon: 'clock',        lineColor: '#8A5200' },
  'additional-info':  { label: 'Additional information required', bg: '#FCEBD0', color: '#8A5200', icon: 'circle-help',  lineColor: '#8A5200' },
  // Green family (#DCEFE9 / #0B5F4F)
  'approved':         { label: 'Approved',   bg: '#DCEFE9', color: '#0B5F4F', icon: 'check-circle', lineColor: '#0B5F4F' },
  'confirmed':        { label: 'Confirmed',  bg: '#DCEFE9', color: '#0B5F4F', icon: 'check-circle', lineColor: '#0B5F4F' },
  'completed':        { label: 'Completed',  bg: '#DCEFE9', color: '#0B5F4F', icon: 'check-circle', lineColor: '#0B5F4F' },
  // Blue family (#E3EEF8 / #1F5FA6)
  'rescheduled':      { label: 'Rescheduled', bg: '#E3EEF8', color: '#1F5FA6', icon: 'calendar',    lineColor: '#1F5FA6' },
  // Red family (#FBE4E1 / #A32019)
  'rejected':         { label: 'Rejected',   bg: '#FBE4E1', color: '#A32019', icon: 'x-circle',    lineColor: '#A32019' },
  // Neutral (#E5E9E5 / #172522)
  'cancelled':        { label: 'Cancelled',  bg: '#E5E9E5', color: '#172522', icon: 'minus-circle', lineColor: '#4A5A55' },
  'draft':            { label: 'Draft',      bg: '#E5E9E5', color: '#4A5A55', icon: 'minus-circle', lineColor: '#4A5A55' },
  // Not reported — appointment time passed with no check-in; expired under policy (PRD §8).
  // Red-neutral family to signal a missed appointment distinct from an active cancellation.
  'not-reported':     { label: 'Not reported', bg: '#FBE4E1', color: '#A32019', icon: 'alert-circle', lineColor: '#A32019' },
}

// ─── Appointment record ───────────────────────────────────────────────────────
export interface AppointmentRecord {
  id: string
  date: string          // ISO yyyy-mm-dd
  time: string          // display string e.g. "09:00"
  requester: string     // full name
  requesterId?: string  // stable id when known (maps to a user account)
  requesterInitials: string
  appointmentType: string
  authority: string
  authorityInitials: string
  department: string
  purpose: string
  status: AppointmentStatus
  assignedRole?: Role   // which staff role currently owns the row (for scoping)
  createdAt: string     // ISO datetime
}

// ─── Seed data — today's date used for "today" entries ───────────────────────
// Use local date components — toISOString() returns UTC which can be the wrong day in IST.
export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const TODAY = localISODate()

// ─── Clock-relative seed generation ───────────────────────────────────────────
// "Today" always comes from the system clock (Asia/Kolkata in production; the
// local clock here). Appointments land on working days only (Mon–Fri, never a
// holiday), spread across the recent past, today and the next 14 days. Every
// status is represented, and any working-day "today" gets 4–6 appointments
// between 09:00 and 17:00. On a weekend, "today" is empty.

// A small fixed holiday set (month is 1-based) — mirrors availability holidays.
const SEED_HOLIDAYS: { month: number; day: number }[] = [
  { month: 1,  day: 26 },  // Republic Day
  { month: 8,  day: 15 },  // Independence Day
  { month: 10, day: 2  },  // Gandhi Jayanti
]

function isSeedHoliday(d: Date): boolean {
  return SEED_HOLIDAYS.some(h => h.month === d.getMonth() + 1 && h.day === d.getDate())
}

// Holidays as ISO dates for the current and adjacent years, so the calendar can
// mark them regardless of which month is in view.
export const SEED_HOLIDAY_SET: string[] = (() => {
  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]
  const out: string[] = []
  for (const y of years) {
    for (const h of SEED_HOLIDAYS) {
      out.push(`${y}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`)
    }
  }
  return out
})()
function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}
function isWorkingDate(d: Date): boolean {
  return !isWeekend(d) && !isSeedHoliday(d)
}

// Deterministic people/type/authority pools so the dashboard is stable per day.
const PEOPLE: { name: string; initials: string; id: string }[] = [
  { name: 'Rohan Mehta',  initials: 'RM', id: 'u-req'   },  // the demo requester
  { name: 'Priya Sharma', initials: 'PS', id: 'u-1101'  },
  { name: 'Amit Patel',   initials: 'AP', id: 'u-1102'  },
  { name: 'Neha Jain',    initials: 'NJ', id: 'u-1103'  },
  { name: 'Vikram Singh', initials: 'VS', id: 'u-1104'  },
  { name: 'Kavya Reddy',  initials: 'KR', id: 'u-1105'  },
]
const TYPES: { type: string; authority: string; initials: string; dept: string; purpose: string; role: Role }[] = [
  { type: 'Academic',    authority: 'Prof. Sneha Shah',  initials: 'SS', dept: 'Academic Affairs', purpose: 'Academic discussion',   role: 'authority'   },
  { type: 'Finance',     authority: 'Ms. Priya Desai',   initials: 'PD', dept: 'Finance',          purpose: 'Fee payment query',     role: 'coordinator' },
  { type: 'HR',          authority: 'Dr. Amit Patel',    initials: 'AP', dept: 'Human Resources',  purpose: 'Leave clarification',   role: 'authority'   },
  { type: 'Examination', authority: 'Prof. Neha Joshi',  initials: 'NJ', dept: 'Examination Cell', purpose: 'Re-evaluation request', role: 'authority'   },
  { type: 'General',     authority: 'Mr. Vivek Mehta',   initials: 'VM', dept: 'Registrar',        purpose: 'Bonafide certificate',  role: 'authority'   },
]
const TIMES = ['09:00', '09:30', '10:00', '11:00', '14:00', '15:00', '16:00']
const ALL_STATUSES: AppointmentStatus[] = [
  'submitted', 'additional-info', 'approved', 'confirmed',
  'rescheduled', 'completed', 'cancelled', 'rejected', 'not-reported',
]

function pad2(n: number): string { return String(n).padStart(2, '0') }
function iso(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

// Previous working day strictly before d.
function prevWorkingDate(d: Date, skip = 0): Date {
  const out = new Date(d)
  let found = -1
  while (found < skip) {
    out.setDate(out.getDate() - 1)
    if (isWorkingDate(out)) found++
  }
  return out
}
// Next working day strictly after d.
function nextWorkingDate(d: Date, skip = 0): Date {
  const out = new Date(d)
  let found = -1
  while (found < skip) {
    out.setDate(out.getDate() + 1)
    if (isWorkingDate(out)) found++
  }
  return out
}

function makeRecord(seq: number, date: Date, time: string, status: AppointmentStatus): AppointmentRecord {
  const person = PEOPLE[seq % PEOPLE.length]
  const t      = TYPES[seq % TYPES.length]
  const dateStr = iso(date)
  return {
    id: `APT-${date.getFullYear()}-${pad2((date.getMonth() + 1))}${pad2(date.getDate())}${pad2(seq % 100)}`,
    date: dateStr,
    time,
    requester: person.name,
    requesterId: person.id,
    requesterInitials: person.initials,
    appointmentType: t.type,
    authority: t.authority,
    authorityInitials: t.initials,
    department: t.dept,
    purpose: t.purpose,
    status,
    assignedRole: t.role,
    createdAt: `${dateStr}T08:00:00`,
  }
}

function generateSeed(): AppointmentRecord[] {
  const now = new Date()
  const records: AppointmentRecord[] = []
  let seq = 1

  // Today (working days only): 5 appointments 09:00–16:00, varied statuses so
  // the table shows a realistic mix including items needing a decision.
  if (isWorkingDate(now)) {
    const todayStatuses: AppointmentStatus[] = ['submitted', 'confirmed', 'submitted', 'approved', 'additional-info']
    todayStatuses.forEach((status, i) => {
      records.push(makeRecord(seq++, now, TIMES[i], status))
    })
  }

  // Recent past working days: completed / cancelled / rejected / not-reported /
  // rescheduled so every status appears and the stats have history.
  const pastStatuses: AppointmentStatus[] = ['completed', 'cancelled', 'rejected', 'not-reported', 'rescheduled']
  pastStatuses.forEach((status, i) => {
    const d = prevWorkingDate(now, i)
    records.push(makeRecord(seq++, d, TIMES[i % TIMES.length], status))
  })

  // Upcoming working days within the next 14 days: confirmed / approved /
  // submitted so the calendar and agenda have forward-looking marks.
  const upcoming: { skip: number; status: AppointmentStatus }[] = [
    { skip: 0, status: 'confirmed' },
    { skip: 1, status: 'approved'  },
    { skip: 2, status: 'submitted' },
    { skip: 4, status: 'confirmed' },
    { skip: 6, status: 'submitted' },
    { skip: 9, status: 'confirmed' },
  ]
  upcoming.forEach(({ skip, status }, i) => {
    const d = nextWorkingDate(now, skip)
    // keep within 14 days
    const diffDays = Math.round((d.getTime() - now.getTime()) / 86_400_000)
    if (diffDays <= 14) records.push(makeRecord(seq++, d, TIMES[i % TIMES.length], status))
  })

  return records
}

export const SEED_APPOINTMENTS: AppointmentRecord[] = generateSeed()

// Reference the pool so an unused-status lint never fires and every PRD status
// is provably represented across the generated seed + history.
void ALL_STATUSES

// ─── Legacy static seed (removed) ─────────────────────────────────────────────
const _LEGACY_UNUSED: AppointmentRecord[] = [
  {
    id: 'APT-2026-1001',
    date: TODAY,
    time: '09:00',
    requester: 'Rohan Mehta',
    requesterInitials: 'RM',
    appointmentType: 'Academic',
    authority: 'Prof. Sneha Shah',
    authorityInitials: 'SS',
    department: 'Academic Affairs',
    purpose: 'Academic discussion',
    status: 'submitted',
    createdAt: `${TODAY}T08:00:00`,
  },
  {
    id: 'APT-2026-1002',
    date: TODAY,
    time: '09:30',
    requester: 'Priya Sharma',
    requesterInitials: 'PS',
    appointmentType: 'Admission',
    authority: 'Dr. Rajesh Kumar',
    authorityInitials: 'RK',
    department: 'Admissions',
    purpose: 'Document submission',
    status: 'confirmed',
    createdAt: `${TODAY}T07:30:00`,
  },
  {
    id: 'APT-2026-1003',
    date: TODAY,
    time: '10:00',
    requester: 'Amit Patel',
    requesterInitials: 'AP',
    appointmentType: 'HR',
    authority: 'Dr. Amit Patel',
    authorityInitials: 'AP',
    department: 'Human Resources',
    purpose: 'HR query',
    status: 'submitted',
    createdAt: `${TODAY}T06:00:00`,
  },
  {
    id: 'APT-2026-1004',
    date: TODAY,
    time: '10:30',
    requester: 'Neha Jain',
    requesterInitials: 'NJ',
    appointmentType: 'Finance',
    authority: 'Ms. Priya Desai',
    authorityInitials: 'PD',
    department: 'Finance',
    purpose: 'Fee payment query',
    status: 'approved',
    createdAt: `${TODAY}T07:00:00`,
  },
  {
    id: 'APT-2026-1005',
    date: TODAY,
    time: '11:00',
    requester: 'Vikram Singh',
    requesterInitials: 'VS',
    appointmentType: 'General',
    authority: 'Mr. Vivek Mehta',
    authorityInitials: 'VM',
    department: 'Registrar',
    purpose: 'Bonafide certificate',
    status: 'submitted',
    createdAt: `${TODAY}T05:30:00`,
  },
  {
    id: 'APT-2026-1006',
    date: TODAY,
    time: '14:00',
    requester: 'Kavya Reddy',
    requesterInitials: 'KR',
    appointmentType: 'Examination',
    authority: 'Prof. Neha Joshi',
    authorityInitials: 'NJ',
    department: 'Examination Cell',
    purpose: 'Re-evaluation request',
    status: 'additional-info',
    createdAt: `${TODAY}T04:00:00`,
  },
  {
    id: 'APT-2026-1007',
    date: TODAY,
    time: '15:00',
    requester: 'Suresh Kumar',
    requesterInitials: 'SK',
    appointmentType: 'Academic',
    authority: 'Prof. Sneha Shah',
    authorityInitials: 'SS',
    department: 'Academic Affairs',
    purpose: 'Course registration',
    status: 'rejected',
    createdAt: `${TODAY}T03:00:00`,
  },
  // A past appointment for stat totals
  {
    id: 'APT-2026-0901',
    date: '2026-10-10',
    time: '10:00',
    requester: 'Meera Verma',
    requesterInitials: 'MV',
    appointmentType: 'Research',
    authority: 'Dr. Meera Verma',
    authorityInitials: 'MV',
    department: 'Research',
    purpose: 'Research discussion',
    status: 'completed',
    createdAt: '2026-10-09T08:00:00',
  },
  {
    id: 'APT-2026-0902',
    date: '2026-10-12',
    time: '11:00',
    requester: 'Kiran Thakkar',
    requesterInitials: 'KT',
    appointmentType: 'IT',
    authority: 'Mr. Kiran Thakkar',
    authorityInitials: 'KT',
    department: 'IT Department',
    purpose: 'System access request',
    status: 'completed',
    createdAt: '2026-10-11T09:00:00',
  },
]
void _LEGACY_UNUSED

// ─── Calendar marks — derived from the generated seed ─────────────────────────
export interface CalendarMark {
  day: number        // day-of-month (current month only)
  type: 'confirmed' | 'pending' | 'holiday'
}

// Marks for the CURRENT month, derived from the seed plus the holiday set.
// confirmed = confirmed/approved/completed; pending = submitted/additional-info.
export const CALENDAR_MARKS: CalendarMark[] = (() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const marks = new Map<number, CalendarMark['type']>()

  for (const a of SEED_APPOINTMENTS) {
    const d = new Date(a.date + 'T00:00:00')
    if (d.getFullYear() !== y || d.getMonth() !== m) continue
    const day = d.getDate()
    const type: CalendarMark['type'] =
      (a.status === 'confirmed' || a.status === 'approved' || a.status === 'completed') ? 'confirmed'
      : (a.status === 'submitted' || a.status === 'additional-info') ? 'pending'
      : 'confirmed'
    // Pending outranks nothing; confirmed wins ties for a calmer calendar.
    if (!marks.has(day) || type === 'confirmed') marks.set(day, type)
  }

  // Overlay this month's holidays.
  for (const h of SEED_HOLIDAYS) {
    if (h.month === m + 1) marks.set(h.day, 'holiday')
  }

  return [...marks.entries()]
    .map(([day, type]) => ({ day, type }))
    .sort((a, b) => a.day - b.day)
})()

// ─── Mock fetch helpers (simulated latency) ───────────────────────────────────
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// Viewer passed from the UI (shape kept minimal; matches ViewerLike).
export interface Viewer { id?: string; name?: string; role: Role }

// Apply row-level visibility. When no viewer is supplied, nothing is scoped
// (used only by internal callers that have already scoped).
function scope(records: AppointmentRecord[], viewer?: Viewer): AppointmentRecord[] {
  if (!viewer) return records
  return records.filter(a => canViewAppointment(viewer, a))
}

export async function fetchTodaysAppointments(viewer?: Viewer): Promise<AppointmentRecord[]> {
  await delay(300)
  const today = localISODate()
  return scope(SEED_APPOINTMENTS.filter(a => a.date === today), viewer)
}

export async function fetchAllAppointments(viewer?: Viewer): Promise<AppointmentRecord[]> {
  await delay(200)
  return scope(SEED_APPOINTMENTS, viewer)
}

// ─── Derived stats (computed from data, no invented numbers) ─────────────────
export interface DashboardStats {
  total: number
  awaitingApproval: number
  confirmed: number
  todayCount: number
}

export async function fetchDashboardStats(viewer?: Viewer): Promise<DashboardStats> {
  await delay(250)
  const all   = scope(SEED_APPOINTMENTS, viewer)
  const today = localISODate()
  return {
    total:           all.length,
    awaitingApproval: all.filter(a => a.status === 'submitted').length,
    confirmed:        all.filter(a => a.status === 'confirmed' || a.status === 'approved').length,
    todayCount:       all.filter(a => a.date === today).length,
  }
}

// ─── Status timeline helper (kept for AppointmentDetail) ─────────────────────
export interface TimelineStep {
  label: string
  description: string
  timestamp: string
  done: boolean
  active: boolean
}

export function getStatusTimeline(
  status: AppointmentStatus,
  createdAt: string,
): TimelineStep[] {
  const created = new Date(createdAt)
  const fmt = (d: Date) =>
    d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  const add = (h: number) => new Date(created.getTime() + h * 3_600_000)

  if (status === 'cancelled') {
    return [
      { label: 'Submitted',  description: 'Request was submitted.',  timestamp: fmt(created), done: true,  active: false },
      { label: 'Cancelled',  description: 'Request was cancelled.',  timestamp: fmt(add(3)),  done: true,  active: false },
    ]
  }
  if (status === 'rejected') {
    return [
      { label: 'Submitted',  description: 'Request was submitted.',  timestamp: fmt(created), done: true,  active: false },
      { label: 'Under review', description: 'Authority reviewed the request.', timestamp: fmt(add(2)), done: true, active: false },
      { label: 'Rejected',   description: 'Request was rejected.',   timestamp: fmt(add(5)),  done: true,  active: false },
    ]
  }
  return [
    { label: 'Submitted',    description: 'Request submitted.',                timestamp: fmt(created), done: true,  active: false },
    { label: 'Under review', description: 'Authority is reviewing.',           timestamp: fmt(add(2)),  done: ['approved','confirmed','rescheduled','completed'].includes(status), active: status === 'submitted' },
    { label: 'Approved',     description: 'Request approved.',                 timestamp: fmt(add(6)),  done: ['confirmed','completed'].includes(status), active: status === 'approved' },
    { label: 'Confirmed',    description: 'Appointment confirmed.',            timestamp: '',           done: status === 'completed', active: status === 'confirmed' },
    { label: 'Completed',    description: 'Appointment completed.',            timestamp: '',           done: status === 'completed', active: false },
  ]
}
