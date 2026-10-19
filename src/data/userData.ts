// ─── User Accounts (master) ───────────────────────────────────────────────────
// User accounts managed by the super admin (PRD §3 role administration).
// Seeded from the demo users (one per role) plus a few realistic extras.
// Mirrors the eventual Supabase `users` table + role column enforced by RLS.

import type { Role } from '../config/permissions'
import { DEMO_USERS } from '../store/authStore'

// ─── Type ─────────────────────────────────────────────────────────────────────
export interface ManagedUser {
  id:         string
  name:       string
  email:      string
  employeeId: string
  department: string
  role:       Role
  active:     boolean
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
function emailFor(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')
  return `${slug}@university.edu`
}

export function seedUsers(): ManagedUser[] {
  // One account per demo role (these match authStore so the current user is real).
  const demo: ManagedUser[] = Object.values(DEMO_USERS).map(u => ({
    id:         u.id,
    name:       u.name,
    email:      emailFor(u.name),
    employeeId: u.employeeId,
    department: u.department,
    role:       u.role,
    active:     true,
  }))

  // A few extra realistic accounts.
  const extras: ManagedUser[] = [
    { id: 'u-1001', name: 'Prof. Sneha Shah',  email: 'sneha.shah@university.edu',  employeeId: 'PU-2016-052', department: 'Academic Affairs', role: 'coordinator_authority', active: true  },
    { id: 'u-1002', name: 'Ms. Priya Desai',   email: 'priya.desai@university.edu', employeeId: 'PU-2018-077', department: 'Finance',          role: 'coordinator_authority', active: true  },
    { id: 'u-1003', name: 'Rahul Nair',        email: 'rahul.nair@university.edu',  employeeId: 'PU-2021-210', department: 'Academic Affairs', role: 'coordinator_authority', active: true  },
    { id: 'u-1004', name: 'Anita Rao',         email: 'anita.rao@university.edu',   employeeId: 'PU-2020-188', department: 'MIS Department',   role: 'admin_dispatcher',      active: false },
  ]

  return [...demo, ...extras]
}

// ─── Pure validators ────────────────────────────────────────────────────────────
export function isNonEmpty(s: string): boolean {
  return s.trim().length > 0
}

// Simple, pragmatic email shape check (not full RFC): something@something.tld
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
