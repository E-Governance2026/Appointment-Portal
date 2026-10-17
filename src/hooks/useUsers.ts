import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchUsers, createUser, updateUser, deleteUser, setUserActive,
  type Actor,
} from '../services/appointmentsService'
import type { ManagedUser } from '../data/userData'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../config/permissions'

function useActor(): Actor {
  const user = useAuthStore(s => s.user)
  return {
    id:   user?.id   ?? 'anon',
    name: user?.name ?? 'Unknown',
    role: (user?.role ?? 'requester') as Role,
  }
}

const KEY = ['users'] as const

export function useUsers() {
  const actor = useActor()
  return useQuery({
    queryKey: [...KEY, actor.role, actor.id],
    queryFn:  () => fetchUsers(actor),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: KEY })
}

export function useCreateUser() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Omit<ManagedUser, 'id'>) => createUser(actor, input),
    onSuccess: invalidate,
  })
}

export function useUpdateUser() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (user: ManagedUser) => updateUser(actor, user),
    onSuccess: invalidate,
  })
}

export function useDeleteUser() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => deleteUser(actor, id),
    onSuccess: invalidate,
  })
}

export function useSetUserActive() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setUserActive(actor, id, active),
    onSuccess: invalidate,
  })
}
