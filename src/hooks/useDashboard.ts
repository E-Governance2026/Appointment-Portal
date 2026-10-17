import { useQuery } from '@tanstack/react-query'
import {
  fetchTodaysAppointments,
  fetchAllAppointments,
  fetchDashboardStats,
  type Viewer,
} from '../data/mockAppointments'
import { useAuthStore } from '../store/authStore'

// Build the viewer from the signed-in user so every dashboard query is scoped
// by canViewAppointment. The query key includes the user so switching roles
// refetches the correctly scoped data.
function useViewer(): Viewer {
  const user = useAuthStore(s => s.user)
  return { id: user?.id, name: user?.name, role: user?.role ?? 'requester' }
}

export function useTodaysAppointments() {
  const viewer = useViewer()
  return useQuery({
    queryKey: ['appointments', 'today', viewer.role, viewer.id],
    queryFn: () => fetchTodaysAppointments(viewer),
  })
}

export function useAllAppointments() {
  const viewer = useViewer()
  return useQuery({
    queryKey: ['appointments', 'all', viewer.role, viewer.id],
    queryFn: () => fetchAllAppointments(viewer),
  })
}

export function useDashboardStats() {
  const viewer = useViewer()
  return useQuery({
    queryKey: ['dashboard', 'stats', viewer.role, viewer.id],
    queryFn: () => fetchDashboardStats(viewer),
  })
}
