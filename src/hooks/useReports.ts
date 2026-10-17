import { useQuery } from '@tanstack/react-query'
import { fetchReport, type Actor } from '../services/appointmentsService'
import type { ReportFilters } from '../data/reportTypes'
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

export function useReport(filters: ReportFilters) {
  const actor = useActor()
  return useQuery({
    queryKey: [
      'reports', actor.role, actor.id,
      filters.from, filters.to, filters.department ?? '',
      filters.authorityId ?? '', filters.status ?? '',
    ],
    queryFn: () => fetchReport(actor, filters),
  })
}
