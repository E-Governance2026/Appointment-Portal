import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchMasterData,
  createDepartment, updateDepartment, deleteDepartment,
  createAppointmentType, updateAppointmentType, deleteAppointmentType,
  createAuthority, updateAuthority, deleteAuthority,
  type Actor,
} from '../services/appointmentsService'
import type {
  Department, MasterAppointmentType, MasterAuthority,
} from '../data/masterData'
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

const KEY = ['master-data'] as const

// ─── Query ────────────────────────────────────────────────────────────────────
export function useMasterData() {
  const actor = useActor()
  return useQuery({
    queryKey: [...KEY, actor.role],
    queryFn:  () => fetchMasterData(actor),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: KEY })
}

// ─── Department mutations ───────────────────────────────────────────────────────
export function useCreateDepartment() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Omit<Department, 'id'>) => createDepartment(actor, input),
    onSuccess: invalidate,
  })
}
export function useUpdateDepartment() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (dept: Department) => updateDepartment(actor, dept),
    onSuccess: invalidate,
  })
}
export function useDeleteDepartment() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => deleteDepartment(actor, id),
    onSuccess: invalidate,
  })
}

// ─── Appointment type mutations ─────────────────────────────────────────────────
export function useCreateType() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Omit<MasterAppointmentType, 'id'>) => createAppointmentType(actor, input),
    onSuccess: invalidate,
  })
}
export function useUpdateType() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (type: MasterAppointmentType) => updateAppointmentType(actor, type),
    onSuccess: invalidate,
  })
}
export function useDeleteType() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => deleteAppointmentType(actor, id),
    onSuccess: invalidate,
  })
}

// ─── Authority mutations ────────────────────────────────────────────────────────
export function useCreateAuthority() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: Omit<MasterAuthority, 'id'>) => createAuthority(actor, input),
    onSuccess: invalidate,
  })
}
export function useUpdateAuthority() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (auth: MasterAuthority) => updateAuthority(actor, auth),
    onSuccess: invalidate,
  })
}
export function useDeleteAuthority() {
  const actor = useActor(); const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => deleteAuthority(actor, id),
    onSuccess: invalidate,
  })
}
