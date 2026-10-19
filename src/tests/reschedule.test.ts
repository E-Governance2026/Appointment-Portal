import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchApproval,
  fetchAppointmentTimeline,
  proposeReschedule,
  respondReschedule,
  cancelAppointment,
  provideAdditionalInfo,
  markNotReported,
  requestInfo,
  ServiceError,
  __resetApprovals,
  type Actor,
} from '../services/appointmentsService'
import { __clearAudit } from '../data/auditLog'

// ─── Stub actors ──────────────────────────────────────────────────────────────
const authority: Actor    = { id: 'auth-ss', name: 'Prof. Sneha Shah', role: 'coordinator_authority' }
const requester: Actor    = { id: 'u-req',   name: 'Requester',        role: 'requester' }
const admin: Actor        = { id: 'u-adm',   name: 'Admin User',       role: 'admin_dispatcher' }
const coordinator: Actor  = { id: 'u-ca',    name: 'Coordinator',      role: 'coordinator_authority' }

// Known seed records (from approvalData.ts):
const SUBMITTED      = 'APT-2026-2001'   // submitted
const AWAITING_INFO  = 'APT-2026-2003'   // additional-info
const APPROVED       = 'APT-2026-2004'   // approved
const CONFIRMED      = 'APT-2026-2005'   // confirmed

beforeEach(() => {
  __resetApprovals()
  __clearAudit()
})

// ─── Reschedule ───────────────────────────────────────────────────────────────
describe('reschedule — propose', () => {
  it('moves a confirmed appointment to rescheduled and stores the proposed slot', async () => {
    const rec = await proposeReschedule(CONFIRMED, authority, '2026-12-01', '10:30', 'Clash with a meeting.')
    expect(rec.status).toBe('rescheduled')
    expect(rec.proposedDate).toBe('2026-12-01')
    expect(rec.proposedTime).toBe('10:30')

    const timeline = await fetchAppointmentTimeline(CONFIRMED)
    expect(timeline.some(e => e.action === 'reschedule-proposed')).toBe(true)
  })

  it('requires both a date and a time', async () => {
    await expect(proposeReschedule(CONFIRMED, authority, '', '10:30')).rejects.toBeInstanceOf(ServiceError)
    await expect(proposeReschedule(CONFIRMED, authority, '2026-12-01', '')).rejects.toBeInstanceOf(ServiceError)
  })

  it('a requester cannot propose a reschedule', async () => {
    await expect(proposeReschedule(CONFIRMED, requester, '2026-12-01', '10:30')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('reschedule — respond', () => {
  it('accept applies the proposed slot and confirms', async () => {
    await proposeReschedule(APPROVED, authority, '2026-12-05', '14:00')
    const rec = await respondReschedule(APPROVED, requester, 'accept')
    expect(rec.status).toBe('confirmed')
    expect(rec.date).toBe('2026-12-05')
    expect(rec.time).toBe('14:00')
    expect(rec.proposedDate).toBeUndefined()
  })

  it('decline cancels the appointment', async () => {
    await proposeReschedule(APPROVED, authority, '2026-12-05', '14:00')
    const rec = await respondReschedule(APPROVED, requester, 'decline')
    expect(rec.status).toBe('cancelled')
  })

  it('cannot respond when there is no pending reschedule', async () => {
    await expect(respondReschedule(SUBMITTED, requester, 'accept')).rejects.toBeInstanceOf(ServiceError)
  })
})

// ─── Cancel ───────────────────────────────────────────────────────────────────
describe('cancel', () => {
  it('staff can cancel a confirmed appointment with a reason', async () => {
    const rec = await cancelAppointment(CONFIRMED, authority, 'Authority unavailable.')
    expect(rec.status).toBe('cancelled')
    const timeline = await fetchAppointmentTimeline(CONFIRMED)
    expect(timeline.find(e => e.action === 'cancelled')?.detail).toBe('Authority unavailable.')
  })

  it('a requester can request cancellation of their own submitted request', async () => {
    const rec = await cancelAppointment(SUBMITTED, requester, 'No longer needed.')
    expect(rec.status).toBe('cancelled')
  })

  it('requires a reason', async () => {
    await expect(cancelAppointment(CONFIRMED, authority, '  ')).rejects.toBeInstanceOf(ServiceError)
  })
})

// ─── Provide additional information loop ──────────────────────────────────────
describe('provide additional information', () => {
  it('moves additional-info back to submitted', async () => {
    const rec = await provideAdditionalInfo(AWAITING_INFO, requester, 'Attached the missing letter.')
    expect(rec.status).toBe('submitted')
    expect(rec.assignedStage).toBe('Authority review')
  })

  it('round-trips: requestInfo then provide closes the loop', async () => {
    await requestInfo(SUBMITTED, authority, 'Please attach ID proof.')
    const back = await provideAdditionalInfo(SUBMITTED, requester, 'ID proof attached.')
    expect(back.status).toBe('submitted')
  })

  it('cannot provide info when none was requested', async () => {
    await expect(provideAdditionalInfo(SUBMITTED, requester, 'anything')).rejects.toBeInstanceOf(ServiceError)
  })

  it('requires a message', async () => {
    await expect(provideAdditionalInfo(AWAITING_INFO, requester, '')).rejects.toBeInstanceOf(ServiceError)
  })
})

// ─── Mark not reported ────────────────────────────────────────────────────────
describe('mark not reported', () => {
  it('admin dispatcher can mark a confirmed appointment as not reported', async () => {
    const rec = await markNotReported(CONFIRMED, admin)
    expect(rec.status).toBe('not-reported')
    expect(rec.assignedStage).toBe('Not reported')
  })

  it('a requester cannot mark not reported', async () => {
    await expect(markNotReported(CONFIRMED, requester)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('not-reported is terminal: it cannot be marked again', async () => {
    await markNotReported(CONFIRMED, admin)
    const after = await fetchApproval(CONFIRMED)
    expect(after.status).toBe('not-reported')
    // Any further transition is illegal.
    await expect(markNotReported(CONFIRMED, admin)).rejects.toThrow()
  })

  it('cannot mark a submitted request as not reported (illegal transition)', async () => {
    await expect(markNotReported(SUBMITTED, admin)).rejects.toThrow()
  })
})

// ─── Coordinator permissions ───────────────────────────────────────────────────
describe('reschedule — coordinator', () => {
  it('a coordinator can propose a reschedule (has proposeReschedule)', async () => {
    const rec = await proposeReschedule(SUBMITTED, coordinator, '2026-12-10', '09:00')
    expect(rec.status).toBe('rescheduled')
  })

  it('a coordinator cannot mark not reported', async () => {
    await expect(markNotReported(CONFIRMED, coordinator)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})
