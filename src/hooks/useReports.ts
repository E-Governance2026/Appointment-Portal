import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchReport, fetchReportTable, type Actor } from '../services/appointmentsService'
import type { ReportFilters, TableReportResult } from '../data/reportTypes'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../config/permissions'

// Build the Actor from the current auth user (same pattern as the other hooks).
export function useActor(): Actor {
  const user = useAuthStore(s => s.user)
  return {
    id:   user?.id   ?? 'anon',
    name: user?.name ?? 'Unknown',
    role: (user?.role ?? 'requester') as Role,
  }
}

export function useReport(filters: ReportFilters) {
  return useReportOverview(filters)
}

export function useReportOverview(filters: ReportFilters) {
  const actor = useActor()
  const statusKey = Array.isArray(filters.status) ? filters.status.join(',') : (filters.status ?? '')
  return useQuery({
    queryKey: [
      'reports-overview', actor.role, actor.id,
      filters.from, filters.to, filters.dateBasis ?? 'appointment',
      filters.department ?? '', filters.authorityId ?? '',
      filters.typeId ?? '', statusKey, filters.search ?? '',
    ],
    queryFn: () => fetchReport(actor, filters),
    placeholderData: keepPreviousData,
  })
}

export function useReportTable<T>(
  type: 'register' | 'pending' | 'turnaround' | 'changes',
  filters: ReportFilters,
  pagination: { page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {},
) {
  const actor = useActor()
  const statusKey = Array.isArray(filters.status) ? filters.status.join(',') : (filters.status ?? '')
  return useQuery<TableReportResult<T>>({
    queryKey: [
      'reports-table', type, actor.role, actor.id,
      filters.from, filters.to, filters.dateBasis ?? 'appointment',
      filters.department ?? '', filters.authorityId ?? '',
      filters.typeId ?? '', statusKey, filters.search ?? '',
      pagination.page ?? 1, pagination.pageSize ?? 10,
      pagination.sortBy ?? '', pagination.sortOrder ?? 'desc',
    ],
    queryFn: () => fetchReportTable<T>(actor, type, filters, pagination),
    placeholderData: keepPreviousData,
  })
}
