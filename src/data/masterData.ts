// ─── Master Data ──────────────────────────────────────────────────────────────
// Reference data managed by the super admin (PRD §5): departments, appointment
// types and authorities. Seeded from the booking seeds so the whole app shares
// one set of reference values. Mirrors the eventual Supabase master tables.

import { APPOINTMENT_TYPES, AUTHORITIES } from './bookingSeeds'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Department {
  id:     string
  name:   string
  code:   string   // short code, e.g. ACAD
  active: boolean
}

export interface MasterAppointmentType {
  id:          string
  name:        string
  description: string
  defaultDurationMinutes: number
  active:      boolean
}

export interface MasterAuthority {
  id:          string
  name:        string
  designation: string
  department:  string        // department name
  typeIds:     string[]      // appointment type ids this authority handles
  active:      boolean
}

export interface MasterData {
  departments: Department[]
  types:       MasterAppointmentType[]
  authorities: MasterAuthority[]
}

// ─── Seed derivation ────────────────────────────────────────────────────────────
function codeFor(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 4)
}

// Departments are derived from the distinct authority departments.
function seedDepartments(): Department[] {
  const names = Array.from(new Set(AUTHORITIES.map(a => a.department))).filter(Boolean)
  return names.map((name, i) => ({
    id:     `dept-${i + 1}`,
    name,
    code:   codeFor(name),
    active: true,
  }))
}

function seedTypes(): MasterAppointmentType[] {
  return APPOINTMENT_TYPES.map(t => ({
    id:          t.id,
    name:        t.name,
    description: t.description,
    defaultDurationMinutes: t.defaultDurationMinutes,
    active:      t.active,
  }))
}

function seedAuthorities(): MasterAuthority[] {
  return AUTHORITIES.map(a => ({
    id:          a.id,
    name:        a.name,
    designation: a.designation,
    department:  a.department,
    typeIds:     [...a.typeIds],
    active:      a.active,
  }))
}

export function seedMasterData(): MasterData {
  return {
    departments: seedDepartments(),
    types:       seedTypes(),
    authorities: seedAuthorities(),
  }
}

// ─── Pure validators ────────────────────────────────────────────────────────────
/** Case-insensitive trimmed equality for uniqueness checks. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function isNonEmpty(s: string): boolean {
  return s.trim().length > 0
}
