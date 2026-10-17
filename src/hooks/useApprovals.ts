import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchApprovalQueue,
  fetchApproval,
  fetchAppointmentTimeline,
  approveAppointment,
  rejectAppointment,
  requestInfo,
  confirmAppointment,
  forwardForApproval,
  addInternalRemark,
  proposeReschedule,
  respondReschedule,
  cancelAppointment,
  provideAdditionalInfo,
  markNotReported,
  type Actor,
} from '../services/appointmentsService'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../config/permissions'

// Build the Actor object from the current auth user.
function useActor(): Actor {
  const user = useAuthStore(s => s.user)
  return {
    id:   user?.id   ?? 'anon',
    name: user?.name ?? 'Unknown',
    role: (user?.role ?? 'requester') as Role,
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────────
export function useApprovalQueue() {
  const actor = useActor()
  return useQuery({
    queryKey: ['approvals', 'queue', actor.role, actor.id],
    queryFn:  () => fetchApprovalQueue(actor),
  })
}

export function useApproval(id: string | undefined) {
  return useQuery({
    queryKey: ['approvals', 'detail', id],
    queryFn:  () => fetchApproval(id!),
    enabled:  !!id,
  })
}

export function useAppointmentTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ['approvals', 'timeline', id],
    queryFn:  () => fetchAppointmentTimeline(id!),
    enabled:  !!id,
  })
}

// ─── Mutations ──────────────────────────────────────────────────────────────────
// All mutations invalidate the queue + the affected detail + its timeline.
function useInvalidate() {
  const qc = useQueryClient()
  return (id: string) => {
    qc.invalidateQueries({ queryKey: ['approvals', 'queue'] })
    qc.invalidateQueries({ queryKey: ['approvals', 'detail', id] })
    qc.invalidateQueries({ queryKey: ['approvals', 'timeline', id] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })  // stats depend on statuses
  }
}

export function useApprove() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, note, date, time }: { id: string; note?: string; date?: string; time?: string }) =>
      approveAppointment(id, actor, {
        note,
        slot: date && time ? { date, time } : undefined,
      }),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useReject() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectAppointment(id, actor, reason),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useRequestInfo() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      requestInfo(id, actor, message),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useConfirm() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => confirmAppointment(id, actor),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useForward() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, toRole }: { id: string; toRole: Role }) =>
      forwardForApproval(id, actor, toRole),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useAddRemark() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      addInternalRemark(id, actor, text),
    onSuccess: (ev) => invalidate(ev.appointmentId),
  })
}

export function useProposeReschedule() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, date, time, note }: { id: string; date: string; time: string; note?: string }) =>
      proposeReschedule(id, actor, date, time, note),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useRespondReschedule() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accept' | 'decline' }) =>
      respondReschedule(id, actor, decision),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useCancel() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelAppointment(id, actor, reason),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useProvideInfo() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      provideAdditionalInfo(id, actor, message),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useMarkNotReported() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => markNotReported(id, actor),
    onSuccess: (rec) => invalidate(rec.id),
  })
}
