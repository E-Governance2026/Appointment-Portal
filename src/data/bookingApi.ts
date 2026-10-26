// ─── Booking Mock API ─────────────────────────────────────────────────────────
// All functions simulate network latency and enforce business rules.
// In-memory stores (drafts, submitted appointments, slot registry) persist for
// the lifetime of the browser session.

import {
  APPOINTMENT_TYPES,
  PURPOSES,
  AUTHORITIES,
  LOCATIONS,
  REQUIRED_DOC_TYPES,
  BUSINESS_RULES,
  HOLIDAYS,
  MOCK_REQUESTER,
  type AppointmentType,
  type Purpose,
  type Authority,
  type Location,
  type RequiredDocType,
  type AnyRole,
} from './bookingSeeds'

import { activeTypeIds, activeAuthorityIds } from '../services/appointmentsService'
import { api } from '../services/apiClient'

// Which data source backs the booking submit (same flag the service uses).
const DATA_SOURCE: 'mock' | 'supabase' =
  import.meta.env.MODE === 'test' ? 'mock' : (import.meta.env.VITE_API_BASE_URL ? 'supabase' : 'mock')

// The subset of the backend appointment DTO the booking submit reads back.
interface BackendAppointment {
  id: string
  typeId: string
  typeName: string
  purposeLabel: string
  authorityId: string
  authorityName: string
  department: string
  date: string
  time: string
  subject: string
  description: string
  mode: MeetingMode
  locationLabel: string
  requester: string
  requesterId?: string
  submittedAt: string
}

// Re-export for convenience
export type { AppointmentType, Purpose, Authority, Location, RequiredDocType }
export { MOCK_REQUESTER, LOCATIONS }

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlotState = 'available' | 'booked' | 'held'

export interface TimeSlot {
  time: string        // 'HH:MM'
  state: SlotState
  label: string       // 'Booked' | 'Held for a pending request' | ''
}

export interface DayAvailability {
  date: string        // ISO yyyy-mm-dd
  open: boolean
  reason?: string     // 'Holiday', 'Non-working day', 'Outside booking window', 'Past date', 'No slots'
  holidayLabel?: string
}

export type MeetingMode = 'physical' | 'online' | 'phone'

export interface UploadedDoc {
  docTypeId: string
  fileName: string
  fileSize: number    // bytes
  url: string         // mock object URL
}

export interface BookingDraft {
  id: string
  status: 'draft'
  // step 1
  typeId: string
  purposeId: string
  // step 2
  authorityId: string
  autoAssigned: boolean
  // step 3
  date: string        // ISO yyyy-mm-dd
  time: string        // 'HH:MM'
  // step 4
  subject: string
  description: string
  mode: MeetingMode
  locationId: string
  participantCount: number | null
  supportingReference: string
  // step 5
  documents: UploadedDoc[]
  // meta
  createdAt: string
  updatedAt: string
}

export interface SubmittedAppointment {
  id: string          // APT-2026-XXXX
  draftId: string
  status: 'submitted'
  typeId: string
  typeName: string
  purposeId: string
  purposeLabel: string
  authorityId: string
  authorityName: string
  authorityDesignation: string
  department: string
  date: string
  time: string
  subject: string
  description: string
  mode: MeetingMode
  locationId: string
  locationLabel: string
  participantCount: number | null
  supportingReference: string
  documents: UploadedDoc[]
  requesterId: string
  requesterName: string
  requesterEmployeeId: string
  requesterDepartment: string
  submittedAt: string
  timeline: { event: string; timestamp: string; actor: string }[]
}

// ─── API error types ──────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'slot_unavailable'
  | 'duplicate_request'
  | 'validation_error'
  | 'not_found'
  | 'network_error'

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message)
  }
}

// ─── In-memory stores ─────────────────────────────────────────────────────────

const DRAFT_STORE  = new Map<string, BookingDraft>()
const SUBMIT_STORE = new Map<string, SubmittedAppointment>()
// Slot registry: key = 'authorityId|date|time', value = 'booked' | 'held'
const SLOT_REGISTRY = new Map<string, SlotState>()
// Idempotency key store: key -> appointmentId
const IDEMPOTENCY_STORE = new Map<string, string>()

// Sequential counter for appointment IDs (starts after existing seeds)
let apptCounter = 1010

function nextApptId(): string {
  return `APT-2026-${apptCounter++}`
}

function generateDraftId(): string {
  return `DFT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── Timezone-safe local date string (yyyy-mm-dd) ─────────────────────────────
// Using .toISOString() returns UTC date, which can be one day behind in IST.
// Always derive date strings from local year/month/day components instead.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Exported for held-slot testing ──────────────────────────────────────────
export function getSlotRegistry() { return SLOT_REGISTRY }

// ─── Helper: is a date a working day? ────────────────────────────────────────
function isWorkingDay(date: Date): boolean {
  return BUSINESS_RULES.workingDays.includes(date.getDay())
}

function isHoliday(dayOfMonth: number): { isHol: boolean; label?: string } {
  const h = HOLIDAYS.find(h => h.day === dayOfMonth)
  return h ? { isHol: true, label: h.label } : { isHol: false }
}

// ─── Generate 30-minute slots for a working day ───────────────────────────────
function generateRawSlots(): string[] {
  const slots: string[] = []
  for (let h = 9; h < 17; h++) {
    for (const m of [0, 30]) {
      if (h === 12) continue // lunch break at 12:00 and 12:30
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

// ─── ENDPOINT: fetchAppointmentTypes ─────────────────────────────────────────
export async function fetchAppointmentTypes(role: AnyRole): Promise<AppointmentType[]> {
  await delay(200)
  // Honor the editable master-data active flags so an admin deactivating a type
  // in Master Management removes it from the booking flow. Types unknown to the
  // master store (none, in practice, since master seeds from these) stay visible.
  const active = activeTypeIds()
  return APPOINTMENT_TYPES.filter(
    t => t.active && t.eligibleRoles.includes(role) && (active.size === 0 || active.has(t.id)),
  )
}

// ─── ENDPOINT: fetchPurposes ──────────────────────────────────────────────────
export async function fetchPurposes(typeId: string): Promise<Purpose[]> {
  await delay(150)
  return PURPOSES.filter(p => p.typeId === typeId)
}

// ─── ENDPOINT: fetchAuthorities ───────────────────────────────────────────────
export async function fetchAuthoritiesByType(
  typeId: string,
  departmentFilter?: string,
): Promise<Authority[]> {
  await delay(250)
  // Honor master-data active flags: an authority deactivated in Master
  // Management no longer appears as bookable.
  const active = activeAuthorityIds()
  return AUTHORITIES.filter(
    a =>
      a.active &&
      a.typeIds.includes(typeId) &&
      (!departmentFilter || a.department === departmentFilter) &&
      (active.size === 0 || active.has(a.id)),
  )
}

// ─── ENDPOINT: fetchMonthAvailability ────────────────────────────────────────
export async function fetchMonthAvailability(
  authorityId: string,
  year: number,
  month: number,   // 0-based
): Promise<DayAvailability[]> {
  await delay(300)

  const today   = new Date()
  today.setHours(0, 0, 0, 0)
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() + BUSINESS_RULES.bookingWindowDays)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const result: DayAvailability[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date    = new Date(year, month, d)
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    if (date < today) {
      result.push({ date: dateStr, open: false, reason: 'Past date' }); continue
    }
    if (date > windowEnd) {
      result.push({ date: dateStr, open: false, reason: 'Outside booking window' }); continue
    }
    if (!isWorkingDay(date)) {
      result.push({ date: dateStr, open: false, reason: 'Non-working day' }); continue
    }
    const hol = isHoliday(d)
    if (hol.isHol) {
      result.push({ date: dateStr, open: false, reason: 'Holiday', holidayLabel: hol.label }); continue
    }

    // Check if any slot is available
    const rawSlots = generateRawSlots()
    const hasSlot  = rawSlots.some(t => {
      const key = `${authorityId}|${dateStr}|${t}`
      return !SLOT_REGISTRY.has(key)
    })
    result.push({ date: dateStr, open: hasSlot, reason: hasSlot ? undefined : 'No slots' })
  }

  return result
}

// ─── ENDPOINT: fetchDaySlots ──────────────────────────────────────────────────
export async function fetchDaySlots(
  authorityId: string,
  date: string,
): Promise<TimeSlot[]> {
  await delay(200)

  const [y, m, d] = date.split('-').map(Number)
  const dateObj   = new Date(y, m - 1, d)
  const today     = new Date()
  today.setHours(0, 0, 0, 0)
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() + BUSINESS_RULES.bookingWindowDays)

  if (dateObj < today)     throw new ApiError('validation_error', 'Past date')
  if (dateObj > windowEnd) throw new ApiError('validation_error', 'Outside booking window')
  if (!isWorkingDay(dateObj)) throw new ApiError('validation_error', 'Non-working day')

  const hol = isHoliday(d)
  if (hol.isHol) throw new ApiError('validation_error', `Holiday: ${hol.label}`)

  const now        = new Date()
  const minNotice  = BUSINESS_RULES.minNoticehours * 3_600_000
  const isToday    = dateObj.toDateString() === now.toDateString()

  return generateRawSlots().map(time => {
    const key = `${authorityId}|${date}|${time}`
    const reg  = SLOT_REGISTRY.get(key)

    if (reg === 'booked') {
      return { time, state: 'booked' as SlotState, label: 'Booked' }
    }
    if (reg === 'held') {
      return {
        time,
        state: 'held' as SlotState,
        label: BUSINESS_RULES.pendingRequestsReserveSlot
          ? 'Held for a pending request'
          : 'Booked',
      }
    }

    // Check min-notice for same-day slots
    if (isToday) {
      const [sh, sm] = time.split(':').map(Number)
      const slotMs   = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), sh, sm).getTime()
      if (slotMs - now.getTime() < minNotice) {
        return { time, state: 'booked' as SlotState, label: 'Booked' }
      }
    }

    return { time, state: 'available' as SlotState, label: '' }
  })
}

// ─── ENDPOINT: fetchLocations ─────────────────────────────────────────────────
export async function fetchLocations(department?: string): Promise<Location[]> {
  await delay(100)
  if (!department) return LOCATIONS
  return LOCATIONS.filter(l => !l.department || l.department === department)
}

// ─── ENDPOINT: fetchRequiredDocTypes ─────────────────────────────────────────
export async function fetchRequiredDocTypes(typeId: string): Promise<RequiredDocType[]> {
  await delay(100)
  return REQUIRED_DOC_TYPES.filter(d => d.typeId === typeId)
}

// ─── ENDPOINT: saveDraft ─────────────────────────────────────────────────────
export async function saveDraft(
  draft: Partial<BookingDraft> & { id?: string },
): Promise<BookingDraft> {
  await delay(300)

  const now = new Date().toISOString()
  if (draft.id && DRAFT_STORE.has(draft.id)) {
    const existing = DRAFT_STORE.get(draft.id)!
    const updated: BookingDraft = { ...existing, ...draft, updatedAt: now }
    DRAFT_STORE.set(draft.id, updated)
    return updated
  }

  const newDraft: BookingDraft = {
    id:                  generateDraftId(),
    status:              'draft',
    typeId:              '',
    purposeId:           '',
    authorityId:         '',
    autoAssigned:        false,
    date:                '',
    time:                '',
    subject:             '',
    description:         '',
    mode:                'physical',
    locationId:          '',
    participantCount:    null,
    supportingReference: '',
    documents:           [],
    createdAt:           now,
    updatedAt:           now,
    ...draft,
  }
  DRAFT_STORE.set(newDraft.id, newDraft)
  return newDraft
}

// ─── ENDPOINT: loadDraft ─────────────────────────────────────────────────────
export async function loadDraft(id: string): Promise<BookingDraft> {
  await delay(200)
  const draft = DRAFT_STORE.get(id)
  if (!draft) throw new ApiError('not_found', `Draft ${id} not found.`)
  return draft
}

// ─── ENDPOINT: uploadDocument ────────────────────────────────────────────────
export interface UploadProgress {
  percent: number
  done: boolean
  error?: string
  doc?: UploadedDoc
}

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
])

export async function uploadDocument(
  file: File,
  docTypeId: string,
  typeId: string,
  onProgress: (p: UploadProgress) => void,
): Promise<UploadedDoc> {
  const type = APPOINTMENT_TYPES.find(t => t.id === typeId)
  const maxBytes = (type?.maxFileSizeMb ?? 10) * 1_048_576

  if (!ACCEPTED_MIME.has(file.type)) {
    const err = `This file type is not allowed. Upload a PDF, DOCX, JPG or PNG.`
    onProgress({ percent: 0, done: true, error: err })
    throw new ApiError('validation_error', err)
  }
  if (file.size > maxBytes) {
    const mb  = (type?.maxFileSizeMb ?? 10)
    const err = `This file is larger than ${mb} MB. Choose a smaller file.`
    onProgress({ percent: 0, done: true, error: err })
    throw new ApiError('validation_error', err)
  }

  // Simulate chunked upload progress
  for (const pct of [20, 50, 80, 100]) {
    await delay(200)
    onProgress({ percent: pct, done: pct === 100 })
  }

  const doc: UploadedDoc = {
    docTypeId,
    fileName: file.name,
    fileSize: file.size,
    url:      URL.createObjectURL(file),
  }
  onProgress({ percent: 100, done: true, doc })
  return doc
}

// ─── ENDPOINT: submitAppointment ─────────────────────────────────────────────
export async function submitAppointment(
  draft: BookingDraft,
  idempotencyKey: string,
): Promise<SubmittedAppointment> {
  if (DATA_SOURCE === 'supabase') {
    // The backend's 3-step submit: bookWith (authority id) + optional slot +
    // subject + description. It derives the type from the authority and the
    // requester identity from the token. Returns an appointment DTO which we
    // map to the SubmittedAppointment shape the confirmation screen reads.
    const res = await api.post<{ appointment: BackendAppointment }>(
      '/appointments',
      { bookWith: draft.authorityId, date: draft.date, time: draft.time, subject: draft.subject, description: draft.description, mode: draft.mode },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    const a = res.appointment
    return {
      id: a.id,
      draftId: draft.id,
      status: 'submitted',
      typeId: a.typeId,
      typeName: a.typeName,
      purposeId: '',
      purposeLabel: a.purposeLabel,
      authorityId: a.authorityId,
      authorityName: a.authorityName,
      authorityDesignation: '',
      department: a.department,
      date: a.date,
      time: a.time,
      subject: a.subject,
      description: a.description,
      mode: a.mode,
      locationId: '',
      locationLabel: a.locationLabel,
      participantCount: null,
      supportingReference: '',
      documents: [],
      requesterId: a.requesterId ?? '',
      requesterName: a.requester,
      requesterEmployeeId: '',
      requesterDepartment: '',
      submittedAt: a.submittedAt,
      timeline: [{ event: 'Submitted', timestamp: a.submittedAt, actor: a.requester }],
    }
  }
  await delay(500)

  // Idempotency: return existing record if key already used
  if (IDEMPOTENCY_STORE.has(idempotencyKey)) {
    const existingId = IDEMPOTENCY_STORE.get(idempotencyKey)!
    const existing   = SUBMIT_STORE.get(existingId)!
    return existing
  }

  // Date and time are optional (revised flow): when the requester leaves the
  // slot blank, the authority proposes a time during approval. Slot-level
  // availability, duplicate and reservation checks only apply when a slot was
  // actually chosen.
  const hasSlot = draft.date.trim().length > 0 && draft.time.trim().length > 0
  const slotKey = `${draft.authorityId}|${draft.date}|${draft.time}`

  if (hasSlot) {
    // Atomic slot check
    const slotState = SLOT_REGISTRY.get(slotKey)
    if (slotState === 'booked') {
      throw new ApiError('slot_unavailable', 'This time is no longer available. Choose another time.')
    }

    // Duplicate check: same requester, authority, date, time, not rejected/cancelled
    const duplicate = [...SUBMIT_STORE.values()].find(
      a =>
        a.requesterId  === MOCK_REQUESTER.id &&
        a.authorityId  === draft.authorityId &&
        a.date         === draft.date &&
        a.time         === draft.time &&
        (a.status as string) !== 'cancelled' &&
        (a.status as string) !== 'rejected',
    )
    if (duplicate) {
      throw new ApiError('duplicate_request', 'You already have a request for this time.')
    }
  }

  // Resolve display values
  const type      = APPOINTMENT_TYPES.find(t => t.id === draft.typeId)!
  const purpose   = PURPOSES.find(p => p.id === draft.purposeId)
  const authority = AUTHORITIES.find(a => a.id === draft.authorityId)!
  const location  = LOCATIONS.find(l => l.id === draft.locationId)

  const id        = nextApptId()
  const now       = new Date().toISOString()

  const record: SubmittedAppointment = {
    id,
    draftId:              draft.id,
    status:               'submitted',
    typeId:               draft.typeId,
    typeName:             type.name,
    purposeId:            draft.purposeId,
    purposeLabel:         purpose?.label ?? '',
    authorityId:          draft.authorityId,
    authorityName:        authority.name,
    authorityDesignation: authority.designation,
    department:           authority.department,
    date:                 draft.date,
    time:                 draft.time,
    subject:              draft.subject,
    description:          draft.description,
    mode:                 draft.mode,
    locationId:           draft.locationId,
    locationLabel:        location?.label ?? '',
    participantCount:     draft.participantCount,
    supportingReference:  draft.supportingReference,
    documents:            draft.documents,
    requesterId:          MOCK_REQUESTER.id,
    requesterName:        MOCK_REQUESTER.name,
    requesterEmployeeId:  MOCK_REQUESTER.employeeId,
    requesterDepartment:  MOCK_REQUESTER.department,
    submittedAt:          now,
    timeline: [
      { event: 'Submitted', timestamp: now, actor: MOCK_REQUESTER.name },
    ],
  }

  SUBMIT_STORE.set(id, record)
  IDEMPOTENCY_STORE.set(idempotencyKey, id)

  // Reserve the slot only when the requester chose one.
  if (hasSlot) {
    if (BUSINESS_RULES.pendingRequestsReserveSlot) {
      SLOT_REGISTRY.set(slotKey, 'held')
    } else {
      SLOT_REGISTRY.set(slotKey, 'booked')
    }
  }

  return record
}

// ─── ENDPOINT: fetchSubmittedAppointment ─────────────────────────────────────
export async function fetchSubmittedAppointment(id: string): Promise<SubmittedAppointment> {
  if (DATA_SOURCE === 'supabase') {
    // Under the real backend the appointment was stored in Supabase, not in
    // the in-memory store. Read it from GET /appointments/:id and map to the
    // SubmittedAppointment shape the confirmation page reads.
    const res = await api.get<{ appointment: BackendAppointment }>(`/appointments/${encodeURIComponent(id)}`)
    const a = res.appointment
    return {
      id:                   a.id,
      draftId:              '',
      status:               'submitted',
      typeId:               a.typeId,
      typeName:             a.typeName,
      purposeId:            '',
      purposeLabel:         a.purposeLabel,
      authorityId:          a.authorityId,
      authorityName:        a.authorityName,
      authorityDesignation: '',
      department:           a.department,
      date:                 a.date,
      time:                 a.time,
      subject:              a.subject,
      description:          a.description,
      mode:                 a.mode,
      locationId:           '',
      locationLabel:        a.locationLabel,
      participantCount:     null,
      supportingReference:  '',
      documents:            [],
      requesterId:          a.requesterId ?? '',
      requesterName:        a.requester,
      requesterEmployeeId:  '',
      requesterDepartment:  '',
      submittedAt:          a.submittedAt,
      timeline:             [{ event: 'Submitted', timestamp: a.submittedAt, actor: a.requester }],
    }
  }
  await delay(200)
  const record = SUBMIT_STORE.get(id)
  if (!record) throw new ApiError('not_found', `Appointment ${id} not found.`)
  return record
}

// ─── ENDPOINT: getNextAvailable ──────────────────────────────────────────────
// Returns the next available date label for an authority card.
export async function getNextAvailable(authorityId: string): Promise<string> {
  await delay(100)
  const today = new Date()
  for (let i = 0; i < BUSINESS_RULES.bookingWindowDays; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    if (!isWorkingDay(d)) continue
    const hol = isHoliday(d.getDate())
    if (hol.isHol) continue
    const dateStr = localDateStr(d)
    const slots   = generateRawSlots()
    const hasSlot = slots.some(t => {
      const key = `${authorityId}|${dateStr}|${t}`
      return !SLOT_REGISTRY.has(key)
    })
    if (hasSlot) {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    }
  }
  return 'No availability'
}

// ─── Helper used by tests: force a slot into a state ─────────────────────────
export function __forceSlotState(
  authorityId: string,
  date: string,
  time: string,
  state: SlotState,
) {
  SLOT_REGISTRY.set(`${authorityId}|${date}|${time}`, state)
}

export function __clearStores() {
  DRAFT_STORE.clear()
  SUBMIT_STORE.clear()
  SLOT_REGISTRY.clear()
  IDEMPOTENCY_STORE.clear()
  apptCounter = 1010
}
