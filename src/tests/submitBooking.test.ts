import { describe, it, expect, beforeEach } from 'vitest'
import {
  submitAppointment,
  fetchSubmittedAppointment,
  __forceSlotState,
  __clearStores,
  ApiError,
} from '../data/bookingApi'
import { BUSINESS_RULES } from '../data/bookingSeeds'
import type { BookingDraft } from '../data/bookingApi'

// ─── Helper: next working day strictly after today ────────────────────────────
const WORKING_DAYS = new Set(BUSINESS_RULES.workingDays)

function nextWorkingDay(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  for (let i = 1; i <= BUSINESS_RULES.bookingWindowDays; i++) {
    const c = new Date(d)
    c.setDate(d.getDate() + i)
    if (WORKING_DAYS.has(c.getDay())) return c
  }
  throw new Error('No working day found within booking window')
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function makeDraft(overrides: Partial<BookingDraft> = {}): BookingDraft {
  const monday = nextWorkingDay()
  return {
    id:                  'DFT-test-001',
    status:              'draft',
    typeId:              'academic',
    purposeId:           'acad-disc',
    authorityId:         'auth-ss',
    autoAssigned:        false,
    date:                isoDate(monday),
    time:                '10:00',
    subject:             'Test subject',
    description:         '',
    mode:                'online',
    locationId:          '',
    participantCount:    null,
    supportingReference: '',
    documents:           [],
    createdAt:           new Date().toISOString(),
    updatedAt:           new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  __clearStores()
})

// ─── Happy path ───────────────────────────────────────────────────────────────
describe('submitAppointment — happy path', () => {
  it('creates a record with a sequential ID starting APT-2026-', async () => {
    const record = await submitAppointment(makeDraft(), crypto.randomUUID())
    expect(record.id).toMatch(/^APT-2026-\d+$/)
  })

  it('sets status to "submitted"', async () => {
    const record = await submitAppointment(makeDraft(), crypto.randomUUID())
    expect(record.status).toBe('submitted')
  })

  it('records a timeline event "Submitted"', async () => {
    const record = await submitAppointment(makeDraft(), crypto.randomUUID())
    expect(record.timeline[0].event).toBe('Submitted')
    expect(record.timeline[0].timestamp).toBeTruthy()
  })

  it('stores the record retrievable by ID', async () => {
    const record  = await submitAppointment(makeDraft(), crypto.randomUUID())
    const fetched = await fetchSubmittedAppointment(record.id)
    expect(fetched.id).toBe(record.id)
    expect(fetched.subject).toBe('Test subject')
  })

  it('each submission gets a unique sequential ID (never reused)', async () => {
    const r1 = await submitAppointment(makeDraft({ time: '09:00' }), crypto.randomUUID())
    const r2 = await submitAppointment(makeDraft({ time: '09:30' }), crypto.randomUUID())
    expect(r1.id).not.toBe(r2.id)
  })
})

// ─── No slot chosen (authority proposes the time later) ───────────────────────
describe('submitAppointment — optional slot', () => {
  it('submits with no date/time and does not reserve a slot', async () => {
    const { getSlotRegistry } = await import('../data/bookingApi')
    const record = await submitAppointment(makeDraft({ date: '', time: '' }), crypto.randomUUID())
    expect(record.status).toBe('submitted')
    expect(record.date).toBe('')
    expect(record.time).toBe('')
    // No slot key should have been reserved.
    const reg = getSlotRegistry()
    expect([...reg.keys()].some(k => k.startsWith('auth-ss||'))).toBe(false)
  })

  it('allows two slot-less requests to the same authority (no duplicate block)', async () => {
    const r1 = await submitAppointment(makeDraft({ date: '', time: '' }), crypto.randomUUID())
    const r2 = await submitAppointment(makeDraft({ date: '', time: '' }), crypto.randomUUID())
    expect(r1.id).not.toBe(r2.id)
  })
})

// ─── Idempotency ──────────────────────────────────────────────────────────────
describe('submitAppointment — idempotency', () => {
  it('returns the same record when called twice with the same key', async () => {
    const key  = crypto.randomUUID()
    const r1   = await submitAppointment(makeDraft(), key)
    const r2   = await submitAppointment(makeDraft(), key)
    expect(r1.id).toBe(r2.id)
  })

  it('does not create two appointments for a double-click (same key)', async () => {
    const key = crypto.randomUUID()
    const [r1, r2] = await Promise.all([
      submitAppointment(makeDraft(), key),
      submitAppointment(makeDraft(), key),
    ])
    expect(r1.id).toBe(r2.id)
  })
})

// ─── Slot conflict (409 slot_unavailable) ─────────────────────────────────────
describe('submitAppointment — slot conflict', () => {
  it('throws ApiError with code slot_unavailable when slot is booked', async () => {
    const draft = makeDraft({ time: '11:00' })
    __forceSlotState(draft.authorityId, draft.date, '11:00', 'booked')
    await expect(submitAppointment(draft, crypto.randomUUID()))
      .rejects.toMatchObject({ code: 'slot_unavailable' })
  })

  it('error message matches spec text', async () => {
    const draft = makeDraft({ time: '11:30' })
    __forceSlotState(draft.authorityId, draft.date, '11:30', 'booked')
    try {
      await submitAppointment(draft, crypto.randomUUID())
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).message).toBe(
        'This time is no longer available. Choose another time.',
      )
    }
  })

  it('409 recovery: caller clears time and retries on a different slot', async () => {
    const date   = isoDate(nextWorkingDay())
    const draft1 = makeDraft({ date, time: '14:00' })
    __forceSlotState('auth-ss', date, '14:00', 'booked')

    let conflicted = false
    let finalRecord

    try {
      await submitAppointment(draft1, crypto.randomUUID())
    } catch (err) {
      if ((err as ApiError).code === 'slot_unavailable') {
        conflicted = true
        // Simulate user going back to step 3 and picking 14:30
        const draft2 = makeDraft({ date, time: '14:30' })
        finalRecord  = await submitAppointment(draft2, crypto.randomUUID())
      }
    }

    expect(conflicted).toBe(true)
    expect(finalRecord?.time).toBe('14:30')
    expect(finalRecord?.status).toBe('submitted')
  })
})

// ─── Duplicate request (409 duplicate_request) ────────────────────────────────
describe('submitAppointment — duplicate detection', () => {
  it('throws duplicate_request when same requester/authority/date/time already exists', async () => {
    const draft = makeDraft({ time: '13:00' })
    await submitAppointment(draft, crypto.randomUUID())       // first submission succeeds

    // Second submission with a different idempotency key but same slot
    await expect(submitAppointment(makeDraft({ time: '13:00' }), crypto.randomUUID()))
      .rejects.toMatchObject({ code: 'duplicate_request' })
  })

  it('duplicate error message matches spec text', async () => {
    const draft = makeDraft({ time: '13:30' })
    await submitAppointment(draft, crypto.randomUUID())
    try {
      await submitAppointment(makeDraft({ time: '13:30' }), crypto.randomUUID())
      expect.fail('Should have thrown')
    } catch (err) {
      expect((err as ApiError).message).toBe('You already have a request for this time.')
    }
  })
})

// ─── Slot reservation ─────────────────────────────────────────────────────────
describe('submitAppointment — slot reservation', () => {
  it('marks the slot as held after submission when pendingRequestsReserveSlot is true', async () => {
    const { getSlotRegistry } = await import('../data/bookingApi')
    const draft  = makeDraft({ time: '15:00' })
    await submitAppointment(draft, crypto.randomUUID())
    const reg    = getSlotRegistry()
    const key    = `${draft.authorityId}|${draft.date}|${draft.time}`
    expect(reg.get(key)).toBe('held')
  })
})

// ─── fetchSubmittedAppointment ────────────────────────────────────────────────
describe('fetchSubmittedAppointment', () => {
  it('throws not_found for an unknown ID', async () => {
    await expect(fetchSubmittedAppointment('APT-2026-9999'))
      .rejects.toMatchObject({ code: 'not_found' })
  })
})
