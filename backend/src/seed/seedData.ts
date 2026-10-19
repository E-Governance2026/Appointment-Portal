// ─── Seed data (mirrors the frontend demo data) ──────────────────────────────
// Plain data the backend owns — no import from the frontend, so the backend is
// standalone. Values and text-slug ids match the mock exactly so the real DB
// looks identical to the mock once the read endpoints are wired.

export const DEPARTMENTS = [
  { id: 'dept-1', name: 'Academic Affairs', code: 'AA',  active: true },
  { id: 'dept-2', name: 'Admissions',       code: 'A',   active: true },
  { id: 'dept-3', name: 'Finance',          code: 'F',   active: true },
  { id: 'dept-4', name: 'Human Resources',  code: 'HR',  active: true },
  { id: 'dept-5', name: 'Examination Cell', code: 'EC',  active: true },
  { id: 'dept-6', name: 'Registrar',        code: 'R',   active: true },
  { id: 'dept-7', name: 'Research',         code: 'R',   active: true },
] as const

// The 7 booking types + the 2 extra type ids referenced by historical
// appointment records ('document', 'training') so the appointments FK holds.
export const APPOINTMENT_TYPES = [
  { id: 'academic',    name: 'Academic',    description: 'Course registration, academic grievances, study-related queries.', default_duration_minutes: 30, active: true },
  { id: 'finance',     name: 'Finance',     description: 'Fee queries, scholarship applications, payment disputes.',          default_duration_minutes: 30, active: true },
  { id: 'hr',          name: 'HR',          description: 'Leave queries, employee grievances, policy clarifications.',        default_duration_minutes: 30, active: true },
  { id: 'admission',   name: 'Admission',   description: 'Document submission, eligibility queries, transfer certificates.',  default_duration_minutes: 20, active: true },
  { id: 'examination', name: 'Examination', description: 'Re-evaluation requests, hall ticket issues, result queries.',       default_duration_minutes: 30, active: true },
  { id: 'general',     name: 'General',     description: 'Bonafide certificates, general enquiries, miscellaneous requests.', default_duration_minutes: 15, active: true },
  { id: 'research',    name: 'Research',    description: 'Research collaboration, funding queries, publication reviews.',      default_duration_minutes: 45, active: true },
  { id: 'document',    name: 'Document Verification', description: 'Document review or verification.',                         default_duration_minutes: 20, active: true },
  { id: 'training',    name: 'Training / Workshop',   description: 'Training and workshop scheduling.',                        default_duration_minutes: 45, active: true },
] as const

// Authorities. The two bookable people in the 3-step flow are Shivendra sir
// (Academic Affairs) and Jaimi sir (Human Resources). The rest remain so that
// approvals/reports/calendar have reference data, but the booking step offers
// only Department + these two.
export const AUTHORITIES = [
  { id: 'auth-ss', name: 'Shivendra sir',     initials: 'SS', designation: 'Academic Coordinator',       department: 'Academic Affairs', active: true,  typeIds: ['academic', 'research'] },
  { id: 'auth-rk', name: 'Dr. Rajesh Kumar',  initials: 'RK', designation: 'Head of Admissions',         department: 'Admissions',       active: true,  typeIds: ['admission', 'general'] },
  { id: 'auth-pd', name: 'Ms. Priya Desai',   initials: 'PD', designation: 'Finance Officer',            department: 'Finance',          active: true,  typeIds: ['finance', 'general'] },
  { id: 'auth-ap', name: 'Jaimi sir',         initials: 'JS', designation: 'HR Manager',                 department: 'Human Resources',  active: true,  typeIds: ['hr', 'general'] },
  { id: 'auth-nj', name: 'Prof. Neha Joshi',  initials: 'NJ', designation: 'Controller of Examinations', department: 'Examination Cell', active: true,  typeIds: ['examination', 'academic'] },
  { id: 'auth-vm', name: 'Mr. Vivek Mehta',   initials: 'VM', designation: 'Registrar',                  department: 'Registrar',        active: true,  typeIds: ['general', 'academic', 'admission'] },
  { id: 'auth-mv', name: 'Dr. Meera Verma',   initials: 'MV', designation: 'Research Director',          department: 'Research',         active: true,  typeIds: ['research'] },
] as const

// The three choices shown on booking step 1 (matches the UI). 'department' maps
// to the registrar as the general departmental contact.
export const BOOK_WITH_OPTIONS = [
  { key: 'department', label: 'Department',    sublabel: 'A general request to the department', authorityId: 'auth-vm' },
  { key: 'auth-ss',    label: 'Shivendra sir', sublabel: 'Academic Affairs',                   authorityId: 'auth-ss' },
  { key: 'auth-ap',    label: 'Jaimi sir',     sublabel: 'Human Resources',                    authorityId: 'auth-ap' },
] as const

// Availability: Mon–Fri 09:00–17:00 default; auth-vm uses 45-minute slots.
const WORKING_HOURS_DEFAULT = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({
  weekday,
  enabled: weekday >= 1 && weekday <= 5,
  start_time: '09:00',
  end_time: '17:00',
}))

export const AVAILABILITY = [
  { authority_id: 'auth-ss', slot_minutes: 30, holidays: [{ date: '2026-10-21', label: 'Institute foundation day' }] },
  { authority_id: 'auth-nj', slot_minutes: 30, holidays: [] },
  { authority_id: 'auth-vm', slot_minutes: 45, holidays: [] },
  { authority_id: 'auth-ap', slot_minutes: 30, holidays: [] },
  { authority_id: 'auth-pd', slot_minutes: 30, holidays: [] },
] as const

export function workingHoursFor(authorityId: string) {
  return WORKING_HOURS_DEFAULT.map(w => ({ authority_id: authorityId, ...w }))
}

// Users: the 4 demo accounts (one per role, matching authStore DEMO_USERS) +
// a few extras. Emails follow the frontend's emailFor() convention.
// coordinator_authority is the merged "Department Coordinator / Authority"
// role; the admin dispatcher runs the reception desk, so no reception account.
export const USERS = [
  { id: 'u-req', name: 'Rohan Mehta',    email: 'rohan.mehta@university.edu',  employee_id: 'PU-2024-120', department: 'Academic Affairs', role: 'requester',             active: true },
  { id: 'u-ca',  name: 'Dr. Amit Patel', email: 'dr.amit.patel@university.edu',employee_id: 'PU-2015-009', department: 'Human Resources',  role: 'coordinator_authority', active: true },
  { id: 'u-adm', name: 'Admin User',     email: 'admin.user@university.edu',   employee_id: 'PU-2024-001', department: 'MIS Department',   role: 'admin_dispatcher',      active: true },
  { id: 'u-sup', name: 'Super Admin',    email: 'super.admin@university.edu',  employee_id: 'PU-2010-000', department: 'MIS Department',   role: 'super_admin',           active: true },
  // extras
  { id: 'u-1001', name: 'Prof. Sneha Shah', email: 'sneha.shah@university.edu',  employee_id: 'PU-2016-052', department: 'Academic Affairs', role: 'coordinator_authority', active: true  },
  { id: 'u-1002', name: 'Ms. Priya Desai',  email: 'priya.desai@university.edu', employee_id: 'PU-2018-077', department: 'Finance',          role: 'coordinator_authority', active: true  },
  { id: 'u-1003', name: 'Rahul Nair',       email: 'rahul.nair@university.edu',  employee_id: 'PU-2021-210', department: 'Academic Affairs', role: 'coordinator_authority', active: true  },
  { id: 'u-1004', name: 'Anita Rao',        email: 'anita.rao@university.edu',   employee_id: 'PU-2020-188', department: 'MIS Department',   role: 'admin_dispatcher',      active: false },
] as const

// "Today" relative to the system clock, so the demo's today-records stay fresh.
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Realistic appointments as the 3-step flow produces them:
//   - appointment-with = Department / Shivendra sir / Jaimi sir
//   - date/time often NULL (authority proposes the time at approval)
//   - only subject + reason (description); no requester-chosen type or purpose
//   - requester_category defaults to 'Staff'; type_id left null (derived later)
// A spread of statuses so the approvals queue, dashboard and reports have data.
// All requested by the demo requester (Rohan Mehta / u-req) so the requester's
// own screens are populated and scoping can be tested.
export function appointments() {
  const TODAY = todayISO()

  // Helper keeps every record consistent and short.
  const base = {
    requester: 'Rohan Mehta', requester_id: 'u-req', requester_initials: 'RM',
    requester_category: 'Staff', type_id: null, type_name: '', purpose_label: '',
    mode: 'physical' as const, location_label: '', documents_count: 0,
  }

  return [
    // 1. Just submitted, no time yet — waiting for Shivendra sir to propose one.
    { ...base, id: 'APT-2026-3001',
      department: 'Academic Affairs', authority_id: 'auth-ss', authority_name: 'Shivendra sir',
      date: null, time: null,
      subject: 'Project supervision request',
      description: 'Requesting supervision for my final-year project.',
      status: 'submitted', submitted_at: `${TODAY}T08:50:00`,
      assigned_stage: 'Authority review', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-ss',
      updated_at: `${TODAY}T08:50:00` },

    // 2. Submitted to Jaimi sir, no time yet.
    { ...base, id: 'APT-2026-3002',
      department: 'Human Resources', authority_id: 'auth-ap', authority_name: 'Jaimi sir',
      date: null, time: null,
      subject: 'Leave policy clarification',
      description: 'Need clarification on the carry-forward leave policy.',
      status: 'submitted', submitted_at: `${TODAY}T07:40:00`,
      assigned_stage: 'Authority review', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-ap',
      updated_at: `${TODAY}T07:40:00` },

    // 3. General department request with a preferred time the requester chose.
    { ...base, id: 'APT-2026-3003',
      department: 'Registrar', authority_id: 'auth-vm', authority_name: 'Mr. Vivek Mehta',
      date: TODAY, time: '15:00',
      subject: 'Bonafide certificate',
      description: 'Requesting a bonafide certificate for a bank application.',
      status: 'submitted', submitted_at: `${TODAY}T06:15:00`,
      assigned_stage: 'Authority review', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-vm',
      updated_at: `${TODAY}T06:15:00` },

    // 4. Approved — Shivendra sir provided a time; awaiting confirmation.
    { ...base, id: 'APT-2026-3004',
      department: 'Academic Affairs', authority_id: 'auth-ss', authority_name: 'Shivendra sir',
      date: TODAY, time: '11:00',
      subject: 'Elective selection guidance',
      description: 'Guidance on choosing electives for next semester.',
      status: 'approved', submitted_at: `${TODAY}T05:50:00`,
      assigned_stage: 'Confirmation pending', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-ss',
      updated_at: `${TODAY}T10:00:00` },

    // 5. Confirmed — scheduled today with Jaimi sir.
    { ...base, id: 'APT-2026-3005',
      department: 'Human Resources', authority_id: 'auth-ap', authority_name: 'Jaimi sir',
      date: TODAY, time: '16:00',
      subject: 'Reimbursement query',
      description: 'Question about the travel reimbursement process.',
      status: 'confirmed', submitted_at: `${TODAY}T04:30:00`,
      assigned_stage: 'Confirmed', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-ap',
      updated_at: `${TODAY}T11:20:00` },

    // 6. Additional information requested by the authority.
    { ...base, id: 'APT-2026-3006',
      department: 'Academic Affairs', authority_id: 'auth-ss', authority_name: 'Shivendra sir',
      date: null, time: null,
      subject: 'Transcript correction',
      description: 'A subject name is misspelled on my transcript.',
      status: 'additional-info', submitted_at: `${TODAY}T03:10:00`,
      assigned_stage: 'Awaiting requester', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-ss',
      updated_at: `${TODAY}T09:10:00` },

    // 7. Completed (past) — a finished meeting with Jaimi sir.
    { ...base, id: 'APT-2026-3007',
      department: 'Human Resources', authority_id: 'auth-ap', authority_name: 'Jaimi sir',
      date: '2026-10-12', time: '10:00',
      subject: 'Experience letter',
      description: 'Collected the experience letter.',
      status: 'completed', submitted_at: '2026-10-11T09:00:00',
      assigned_stage: 'Completed', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-ap',
      updated_at: '2026-10-12T10:30:00' },

    // 8. Rejected (past) — out of scope.
    { ...base, id: 'APT-2026-3008',
      department: 'Academic Affairs', authority_id: 'auth-ss', authority_name: 'Shivendra sir',
      date: null, time: null,
      subject: 'Fee waiver request',
      description: 'Requesting a tuition fee waiver.',
      status: 'rejected', submitted_at: '2026-10-09T08:00:00',
      assigned_stage: 'Rejected', assigned_role: 'coordinator_authority', assigned_to_id: 'auth-ss',
      updated_at: '2026-10-09T15:00:00' },
  ]
}
