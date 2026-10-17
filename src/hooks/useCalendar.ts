import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchCalendarAppointments,
  fetchDayAppointments,
  fetchAvailability,
  updateAvailability,
  type Actor,
} from '../services/appointmentsService'
import type { Availability } from '../data/availabilityData'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../config/permissions'

// Build the Actor object from the current auth user (same pattern as useApprovals).
function useActor(): Actor {
  const user = useAuthStore(s => s.user)
  return {
    id:   user?.id   ?? 'anon',
    name: user?.name ?? 'Unknown',
    role: (user?.role ?? 'requester') as Role,
  }
}

// ─── Calendar queries ─────────────────────────────────────────────────────────
export function useCalendarAppointments(range: { from: string; to: string }) {
  const actor = useActor()
  return useQuery({
    queryKey: ['calendar', 'range', actor.role, actor.id, range.from, range.to],
    queryFn:  () => fetchCalendarAppointments(actor, range),
  })
}

export function useDayAppointments(date: string | undefined) {
  const actor = useActor()
  return useQuery({
    queryKey: ['calendar', 'day', actor.role, actor.id, date],
    queryFn:  () => fetchDayAppointments(actor, date!),
    enabled:  !!date,
  })
}

// ─── Availability ─────────────────────────────────────────────────────────────
export function useAvailability(authorityId: string | undefined) {
  return useQuery({
    queryKey: ['availability', authorityId],
    queryFn:  () => fetchAvailability(authorityId!),
    enabled:  !!authorityId,
  })
}

export function useUpdateAvailability() {
  const actor = useActor()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (next: Availability) => updateAvailability(actor, next),
    onSuccess: (av) => {
      qc.invalidateQueries({ queryKey: ['availability', av.authorityId] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}
