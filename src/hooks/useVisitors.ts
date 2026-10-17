import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchReceptionQueue,
  checkInVisitor,
  checkOutVisitor,
  type Actor,
} from '../services/appointmentsService'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../config/permissions'

// Build the Actor from the current auth user (same pattern as the other hooks).
function useActor(): Actor {
  const user = useAuthStore(s => s.user)
  return {
    id:   user?.id   ?? 'anon',
    name: user?.name ?? 'Unknown',
    role: (user?.role ?? 'requester') as Role,
  }
}

// ─── Query ────────────────────────────────────────────────────────────────────
export function useReceptionQueue(date: string | undefined) {
  const actor = useActor()
  return useQuery({
    queryKey: ['reception', 'queue', actor.role, actor.id, date],
    queryFn:  () => fetchReceptionQueue(actor, date!),
    enabled:  !!date,
  })
}

// ─── Mutations ──────────────────────────────────────────────────────────────────
function useInvalidate() {
  const qc = useQueryClient()
  return (id: string) => {
    qc.invalidateQueries({ queryKey: ['reception', 'queue'] })
    qc.invalidateQueries({ queryKey: ['approvals', 'detail', id] })
    qc.invalidateQueries({ queryKey: ['approvals', 'timeline', id] })
    qc.invalidateQueries({ queryKey: ['calendar'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useCheckIn() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => checkInVisitor(id, actor),
    onSuccess: (rec) => invalidate(rec.id),
  })
}

export function useCheckOut() {
  const actor = useActor()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => checkOutVisitor(id, actor),
    onSuccess: (rec) => invalidate(rec.id),
  })
}
