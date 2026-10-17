import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkInVisitor,
  checkOutVisitor,
  fetchReceptionQueue,
  fetchAppointmentTimeline,
  fetchApproval,
  ServiceError,
  __resetApprovals,
  type Actor,
} from '../services/appointmentsService'
import { __clearAudit } from '../data/auditLog'

// ─── Stub actors ──────────────────────────────────────────────────────────────
const reception: Actor  = { id: 'u-rec', name: 'Front Desk',   role: 'reception' }
const requester: Actor   = { id: 'u-req', name: 'Requester',    role: 'requester' }

// Known seed records (from approvalData.ts):
const CONFIRMED = 'APT-2026-2005'   // status: confirmed, date: TODAY
const SUBMITTED = 'APT-2026-2001'   // status: submitted

const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})()

beforeEach(() => {
  __resetApprovals()
  __clearAudit()
})

// ─── Check-in ───────────────────────────────────────────────────────────────────
describe('visitors — check-in', () => {
  it('sets checkedInAt and records a checked-in audit event, status stays confirmed', async () => {
    const rec = await checkInVisitor(CONFIRMED, reception)
    expect(rec.checkedInAt).toBeTruthy()
    expect(rec.status).toBe('confirmed')      // check-in is NOT a status change
    expect(rec.assignedStage).toBe('Checked in')

    const timeline = await fetchAppointmentTimeline(CONFIRMED)
    expect(timeline.some(e => e.action === 'checked-in')).toBe(true)
  })

  it('blocks a duplicate check-in', async () => {
    await checkInVisitor(CONFIRMED, reception)
    await expect(checkInVisitor(CONFIRMED, reception)).rejects.toMatchObject({ code: 'duplicate' })
  })

  it('cannot check in an appointment that is not confirmed', async () => {
    await expect(checkInVisitor(SUBMITTED, reception)).rejects.toBeInstanceOf(ServiceError)
  })

  it('a requester cannot check a visitor in', async () => {
    await expect(checkInVisitor(CONFIRMED, requester)).rejects.toMatchObject({ code: 'forbidden' })
  })
})

// ─── Check-out ────────────────────────────────────────────────────────────────
describe('visitors — check-out', () => {
  it('completes the appointment and records a checked-out event', async () => {
    await checkInVisitor(CONFIRMED, reception)
    const rec = await checkOutVisitor(CONFIRMED, reception)
    expect(rec.checkedOutAt).toBeTruthy()
    expect(rec.status).toBe('completed')      // check-out completes the visit
    expect(rec.assignedStage).toBe('Completed')

    const timeline = await fetchAppointmentTimeline(CONFIRMED)
    expect(timeline.some(e => e.action === 'checked-out')).toBe(true)
    expect(timeline.some(e => e.action === 'completed')).toBe(true)
  })

  it('cannot check out before checking in', async () => {
    await expect(checkOutVisitor(CONFIRMED, reception)).rejects.toBeInstanceOf(ServiceError)
  })

  it('blocks a duplicate check-out', async () => {
    await checkInVisitor(CONFIRMED, reception)
    await checkOutVisitor(CONFIRMED, reception)
    await expect(checkOutVisitor(CONFIRMED, reception)).rejects.toMatchObject({ code: 'duplicate' })
  })

  it('a requester cannot check a visitor out', async () => {
    await checkInVisitor(CONFIRMED, reception)
    await expect(checkOutVisitor(CONFIRMED, requester)).rejects.toMatchObject({ code: 'forbidden' })
  })
})

// ─── Reception queue ──────────────────────────────────────────────────────────
describe('visitors — reception queue', () => {
  it("returns today's confirmed appointments ordered by time", async () => {
    const q = await fetchReceptionQueue(reception, TODAY)
    expect(q.length).toBeGreaterThan(0)
    q.forEach(r => {
      expect(r.date).toBe(TODAY)
      expect(['confirmed', 'completed']).toContain(r.status)
    })
    const times = q.map(r => r.time)
    expect(times).toEqual([...times].sort((a, b) => a.localeCompare(b)))
  })

  it('keeps a checked-out appointment in the queue as completed', async () => {
    await checkInVisitor(CONFIRMED, reception)
    await checkOutVisitor(CONFIRMED, reception)
    const q = await fetchReceptionQueue(reception, TODAY)
    const rec = q.find(r => r.id === CONFIRMED)
    expect(rec?.status).toBe('completed')
  })

  it('a requester cannot read the reception queue', async () => {
    await expect(fetchReceptionQueue(requester, TODAY)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('an unrelated date returns an empty queue', async () => {
    const q = await fetchReceptionQueue(reception, '1999-01-01')
    expect(q).toEqual([])
  })

  it('does not mutate shared state across reads (returns copies)', async () => {
    const q1 = await fetchReceptionQueue(reception, TODAY)
    q1.forEach(r => { r.subject = 'MUTATED' })
    const after = await fetchApproval(CONFIRMED)
    expect(after.subject).not.toBe('MUTATED')
  })
})
