import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchApprovalQueue,
  fetchApproval,
  fetchAppointmentTimeline,
  approveAppointment,
  rejectAppointment,
  requestInfo,
  confirmAppointment,
  addInternalRemark,
  ServiceError,
  type Actor,
} from '../services/appointmentsService'
import { __resetApprovals } from '../services/appointmentsService'
import { __clearAudit } from '../data/auditLog'

// ─── Stub actors ──────────────────────────────────────────────────────────────
const authority: Actor   = { id: 'auth-ss', name: 'Prof. Sneha Shah', role: 'coordinator_authority' }
const coordinator: Actor = { id: 'u-coo',   name: 'Coordinator',      role: 'coordinator_authority' }
const requester: Actor   = { id: 'u-req',   name: 'Requester',        role: 'requester' }
const superAdmin: Actor  = { id: 'u-sa',    name: 'Super Admin',      role: 'super_admin' }

// Known seed records (from approvalData.ts):
const SUBMITTED = 'APT-2026-2001'   // status: submitted
const APPROVED  = 'APT-2026-2004'   // status: approved
const CONFIRMED = 'APT-2026-2005'   // status: confirmed

beforeEach(() => {
  __resetApprovals()
  __clearAudit()
})

// ─── Reads ────────────────────────────────────────────────────────────────────
describe('approvals service — reads', () => {
  it('super_admin sees the whole queue', async () => {
    const queue = await fetchApprovalQueue(superAdmin)
    expect(queue.length).toBeGreaterThanOrEqual(8)
  })

  it('fetchApproval returns a copy of the record', async () => {
    const rec = await fetchApproval(SUBMITTED)
    expect(rec.id).toBe(SUBMITTED)
    expect(rec.status).toBe('submitted')
  })
})

// ─── Transitions ────────────────────────────────────────────────────────────────
describe('approvals service — approve', () => {
  it('moves submitted → approved and records an audit event', async () => {
    // SUBMITTED (APT-2026-2001) is slot-less; the authority provides a time.
    const rec = await approveAppointment(SUBMITTED, authority, { slot: { date: '2026-12-01', time: '09:30' } })
    expect(rec.status).toBe('approved')
    expect(rec.assignedStage).toBe('Confirmation pending')

    const timeline = await fetchAppointmentTimeline(SUBMITTED)
    expect(timeline.some(e => e.action === 'approved')).toBe(true)
  })

  it('requires a slot to approve a slot-less request', async () => {
    await expect(approveAppointment(SUBMITTED, authority)).rejects.toMatchObject({
      code: 'illegal_transition',
    })
  })

  it('blocks a duplicate approve', async () => {
    const slot = { date: '2026-12-01', time: '09:30' }
    await approveAppointment(SUBMITTED, authority, { slot })
    await expect(approveAppointment(SUBMITTED, authority, { slot })).rejects.toMatchObject({
      code: 'duplicate',
    })
  })
})

describe('approvals service — reject', () => {
  it('moves submitted → rejected with a reason', async () => {
    const rec = await rejectAppointment(SUBMITTED, authority, 'Out of scope.')
    expect(rec.status).toBe('rejected')
    const timeline = await fetchAppointmentTimeline(SUBMITTED)
    expect(timeline.find(e => e.action === 'rejected')?.detail).toBe('Out of scope.')
  })

  it('requires a reason', async () => {
    await expect(rejectAppointment(SUBMITTED, authority, '   ')).rejects.toBeInstanceOf(ServiceError)
  })
})

describe('approvals service — request info', () => {
  it('moves submitted → additional-info with a message', async () => {
    const rec = await requestInfo(SUBMITTED, authority, 'Please attach the approval letter.')
    expect(rec.status).toBe('additional-info')
    expect(rec.assignedStage).toBe('Awaiting requester')
  })

  it('requires a message', async () => {
    await expect(requestInfo(SUBMITTED, authority, '')).rejects.toBeInstanceOf(ServiceError)
  })
})

describe('approvals service — confirm', () => {
  it('moves approved → confirmed (explicit separate step)', async () => {
    const rec = await confirmAppointment(APPROVED, authority)
    expect(rec.status).toBe('confirmed')
    expect(rec.assignedStage).toBe('Confirmed')
  })

  it('blocks confirming an already-confirmed appointment', async () => {
    await expect(confirmAppointment(CONFIRMED, authority)).rejects.toMatchObject({
      code: 'duplicate',
    })
  })

  it('rejects an illegal transition: submitted → confirmed', async () => {
    // confirm permission is present for authority, but the status machine
    // forbids jumping straight from submitted to confirmed.
    await expect(confirmAppointment(SUBMITTED, authority)).rejects.toThrow()
  })
})

// ─── Permission gate ────────────────────────────────────────────────────────────
describe('approvals service — permissions', () => {
  it('a requester cannot approve', async () => {
    await expect(approveAppointment(SUBMITTED, requester)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('a coordinator/authority CAN approve a request assigned to their role', async () => {
    const rec = await approveAppointment(SUBMITTED, coordinator, { slot: { date: '2026-12-01', time: '10:00' } })
    expect(rec.status).toBe('approved')
  })

  it('a coordinator/authority CAN request information', async () => {
    const rec = await requestInfo(SUBMITTED, coordinator, 'Need more detail.')
    expect(rec.status).toBe('additional-info')
  })
})

// ─── Internal remark ──────────────────────────────────────────────────────────
describe('approvals service — internal remark', () => {
  it('records a remark hidden from the requester, without changing status', async () => {
    const before = await fetchApproval(SUBMITTED)
    const ev = await addInternalRemark(SUBMITTED, authority, 'Flagging for the registrar.')
    expect(ev.visibleToRequester).toBe(false)

    const after = await fetchApproval(SUBMITTED)
    expect(after.status).toBe(before.status)   // unchanged
  })

  it('a requester cannot add an internal remark', async () => {
    await expect(addInternalRemark(SUBMITTED, requester, 'note')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

// ─── not found ──────────────────────────────────────────────────────────────────
describe('approvals service — not found', () => {
  it('throws not_found for an unknown id', async () => {
    await expect(approveAppointment('APT-DOES-NOT-EXIST', authority)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

// ─── Approve with slot + confirmation notification (revised flow) ─────────────
describe('approvals service — authority provides the slot at approval', () => {
  it('approve applies an override slot to the record', async () => {
    const rec = await approveAppointment(SUBMITTED, authority, { slot: { date: '2026-12-01', time: '10:30' } })
    expect(rec.status).toBe('approved')
    expect(rec.date).toBe('2026-12-01')
    expect(rec.time).toBe('10:30')

    const timeline = await fetchAppointmentTimeline(SUBMITTED)
    const approved = timeline.find(e => e.action === 'approved')
    expect(approved?.detail).toContain('2026-12-01')
  })

  it('approve still works without a slot when the record already has one (backward compatible)', async () => {
    // APT-2026-2002 keeps a requester-chosen slot, so approving needs no slot.
    const rec = await approveAppointment('APT-2026-2002', superAdmin)
    expect(rec.status).toBe('approved')
    expect(rec.date).toBeTruthy()
    expect(rec.time).toBeTruthy()
  })

  it('confirm records a website + email notification event', async () => {
    // APT-2026-2004 is already approved in the seed; confirm it directly.
    const rec = await confirmAppointment(APPROVED, authority)
    expect(rec.status).toBe('confirmed')

    const timeline = await fetchAppointmentTimeline(APPROVED)
    const notice = timeline.find(e => e.action === 'notification-sent')
    expect(notice).toBeTruthy()
    expect(notice?.summary.toLowerCase()).toContain('email')
  })

  it('end to end: approve with a time, then confirm, sends the confirmation', async () => {
    await approveAppointment(SUBMITTED, authority, { slot: { date: '2026-12-02', time: '11:00' } })
    const confirmed = await confirmAppointment(SUBMITTED, authority)
    expect(confirmed.status).toBe('confirmed')
    expect(confirmed.date).toBe('2026-12-02')

    const timeline = await fetchAppointmentTimeline(SUBMITTED)
    expect(timeline.some(e => e.action === 'notification-sent')).toBe(true)
  })
})
