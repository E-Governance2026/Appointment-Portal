// ─── Booking Seeds ────────────────────────────────────────────────────────────
// All reference data consumed by the booking flow mock API.
// No values are invented; every number is a plausible configuration value.

// ─── Role access ──────────────────────────────────────────────────────────────
export const BOOKING_ALLOWED_ROLES = [
  'requester',
  'coordinator',
  'authority',
  'admin_dispatcher',
  'super_admin',
] as const

export type BookingRole = typeof BOOKING_ALLOWED_ROLES[number]
export type AnyRole = BookingRole | 'reception' | 'unknown'

export function canBook(role: AnyRole): role is BookingRole {
  return (BOOKING_ALLOWED_ROLES as readonly string[]).includes(role)
}

// ─── Business rules ───────────────────────────────────────────────────────────
export interface BusinessRules {
  bookingWindowDays: number          // max days ahead a requester may book
  minNoticehours: number             // min hours before a slot
  maxActiveRequests: number          // per requester
  pendingRequestsReserveSlot: boolean
  workingDays: number[]              // 0 Sun – 6 Sat
}

export const BUSINESS_RULES: BusinessRules = {
  bookingWindowDays: 30,
  minNoticehours: 4,
  maxActiveRequests: 3,
  pendingRequestsReserveSlot: true,
  workingDays: [1, 2, 3, 4, 5],     // Mon–Fri
}

// ─── Holidays (current month – day numbers) ───────────────────────────────────
// In a real system these would come from an HR calendar API.
export const HOLIDAYS: { day: number; label: string }[] = [
  { day: 5,  label: 'University Foundation Day' },
  { day: 24, label: 'National Holiday'          },
]

// ─── Appointment types ────────────────────────────────────────────────────────
export interface AppointmentType {
  id: string
  name: string
  description: string
  defaultDurationMinutes: number
  eligibleRoles: AnyRole[]
  autoAssign: boolean               // if true, skip authority selection
  requiresPurpose: boolean
  showParticipantCount: boolean
  showSupportingReference: boolean
  maxFileSizeMb: number
  active: boolean
}

export const APPOINTMENT_TYPES: AppointmentType[] = [
  {
    id: 'academic',
    name: 'Academic',
    description: 'Course registration, academic grievances, study-related queries.',
    defaultDurationMinutes: 30,
    eligibleRoles: ['requester','coordinator','authority','admin_dispatcher','super_admin'],
    autoAssign: false,
    requiresPurpose: true,
    showParticipantCount: false,
    showSupportingReference: false,
    maxFileSizeMb: 10,
    active: true,
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Fee queries, scholarship applications, payment disputes.',
    defaultDurationMinutes: 30,
    eligibleRoles: ['requester','coordinator','admin_dispatcher','super_admin'],
    autoAssign: false,
    requiresPurpose: true,
    showParticipantCount: false,
    showSupportingReference: true,
    maxFileSizeMb: 10,
    active: true,
  },
  {
    id: 'hr',
    name: 'HR',
    description: 'Leave queries, employee grievances, policy clarifications.',
    defaultDurationMinutes: 30,
    eligibleRoles: ['requester','coordinator','authority','admin_dispatcher','super_admin'],
    autoAssign: false,
    requiresPurpose: true,
    showParticipantCount: false,
    showSupportingReference: false,
    maxFileSizeMb: 10,
    active: true,
  },
  {
    id: 'admission',
    name: 'Admission',
    description: 'Document submission, eligibility queries, transfer certificates.',
    defaultDurationMinutes: 20,
    eligibleRoles: ['requester','coordinator','admin_dispatcher','super_admin'],
    autoAssign: false,
    requiresPurpose: true,
    showParticipantCount: false,
    showSupportingReference: false,
    maxFileSizeMb: 15,
    active: true,
  },
  {
    id: 'examination',
    name: 'Examination',
    description: 'Re-evaluation requests, hall ticket issues, result queries.',
    defaultDurationMinutes: 30,
    eligibleRoles: ['requester','coordinator','admin_dispatcher','super_admin'],
    autoAssign: true,
    requiresPurpose: true,
    showParticipantCount: false,
    showSupportingReference: true,
    maxFileSizeMb: 10,
    active: true,
  },
  {
    id: 'general',
    name: 'General',
    description: 'Bonafide certificates, general enquiries, miscellaneous requests.',
    defaultDurationMinutes: 15,
    eligibleRoles: ['requester','coordinator','authority','admin_dispatcher','super_admin'],
    autoAssign: false,
    requiresPurpose: false,
    showParticipantCount: false,
    showSupportingReference: false,
    maxFileSizeMb: 10,
    active: true,
  },
  {
    id: 'research',
    name: 'Research',
    description: 'Research collaboration, funding queries, publication reviews.',
    defaultDurationMinutes: 45,
    eligibleRoles: ['authority','coordinator','admin_dispatcher','super_admin'],
    autoAssign: false,
    requiresPurpose: true,
    showParticipantCount: true,
    showSupportingReference: true,
    maxFileSizeMb: 20,
    active: true,
  },
]

// ─── Purposes (mapped to type) ────────────────────────────────────────────────
export interface Purpose {
  id: string
  typeId: string
  label: string
}

export const PURPOSES: Purpose[] = [
  { id: 'acad-disc',    typeId: 'academic',    label: 'Academic discussion'      },
  { id: 'acad-reg',     typeId: 'academic',    label: 'Course registration'      },
  { id: 'acad-griev',   typeId: 'academic',    label: 'Academic grievance'       },
  { id: 'acad-noc',     typeId: 'academic',    label: 'NOC letter request'       },
  { id: 'fin-fee',      typeId: 'finance',     label: 'Fee payment query'        },
  { id: 'fin-schol',    typeId: 'finance',     label: 'Scholarship application'  },
  { id: 'fin-dispute',  typeId: 'finance',     label: 'Payment dispute'          },
  { id: 'hr-leave',     typeId: 'hr',          label: 'Leave application query'  },
  { id: 'hr-griev',     typeId: 'hr',          label: 'HR grievance'             },
  { id: 'hr-policy',    typeId: 'hr',          label: 'Policy clarification'     },
  { id: 'adm-doc',      typeId: 'admission',   label: 'Document submission'      },
  { id: 'adm-elig',     typeId: 'admission',   label: 'Eligibility query'        },
  { id: 'adm-tc',       typeId: 'admission',   label: 'Transfer certificate'     },
  { id: 'exam-reval',   typeId: 'examination', label: 'Re-evaluation request'    },
  { id: 'exam-hall',    typeId: 'examination', label: 'Hall ticket issue'        },
  { id: 'exam-result',  typeId: 'examination', label: 'Result query'             },
  { id: 'res-collab',   typeId: 'research',    label: 'Research collaboration'   },
  { id: 'res-fund',     typeId: 'research',    label: 'Funding query'            },
]

// ─── Authorities ──────────────────────────────────────────────────────────────
export interface Authority {
  id: string
  name: string
  initials: string
  designation: string
  department: string
  typeIds: string[]
  active: boolean
}

export const AUTHORITIES: Authority[] = [
  {
    id: 'auth-ss',
    name: 'Prof. Sneha Shah',
    initials: 'SS',
    designation: 'Academic Coordinator',
    department: 'Academic Affairs',
    typeIds: ['academic', 'research'],
    active: true,
  },
  {
    id: 'auth-rk',
    name: 'Dr. Rajesh Kumar',
    initials: 'RK',
    designation: 'Head of Admissions',
    department: 'Admissions',
    typeIds: ['admission', 'general'],
    active: true,
  },
  {
    id: 'auth-pd',
    name: 'Ms. Priya Desai',
    initials: 'PD',
    designation: 'Finance Officer',
    department: 'Finance',
    typeIds: ['finance', 'general'],
    active: true,
  },
  {
    id: 'auth-ap',
    name: 'Dr. Amit Patel',
    initials: 'AP',
    designation: 'HR Manager',
    department: 'Human Resources',
    typeIds: ['hr', 'general'],
    active: true,
  },
  {
    id: 'auth-nj',
    name: 'Prof. Neha Joshi',
    initials: 'NJ',
    designation: 'Controller of Examinations',
    department: 'Examination Cell',
    typeIds: ['examination', 'academic'],
    active: true,
  },
  {
    id: 'auth-vm',
    name: 'Mr. Vivek Mehta',
    initials: 'VM',
    designation: 'Registrar',
    department: 'Registrar',
    typeIds: ['general', 'academic', 'admission'],
    active: true,
  },
  {
    id: 'auth-mv',
    name: 'Dr. Meera Verma',
    initials: 'MV',
    designation: 'Research Director',
    department: 'Research',
    typeIds: ['research'],
    active: true,
  },
]

// ─── Locations (for Physical meeting mode) ────────────────────────────────────
export interface Location {
  id: string
  label: string
  department: string
}

export const LOCATIONS: Location[] = [
  { id: 'loc-acad-204', label: 'Academic Block – Room 204', department: 'Academic Affairs' },
  { id: 'loc-acad-101', label: 'Academic Block – Room 101', department: 'Academic Affairs' },
  { id: 'loc-fin-101',  label: 'Finance Block – Room 101',  department: 'Finance'          },
  { id: 'loc-hr-gf',    label: 'HR Office – Ground Floor',  department: 'Human Resources'  },
  { id: 'loc-adm-05',   label: 'Admin Block – Room 05',     department: 'Admissions'       },
  { id: 'loc-exam-cell',label: 'Examination Cell Office',   department: 'Examination Cell' },
  { id: 'loc-reg',      label: 'Registrar Office',          department: 'Registrar'        },
  { id: 'loc-res',      label: 'Research Block – Room 301', department: 'Research'         },
  { id: 'loc-conf-a',   label: 'Conference Room A',         department: ''                 },
  { id: 'loc-conf-b',   label: 'Conference Room B',         department: ''                 },
]

// ─── Required document types per appointment type ─────────────────────────────
export interface RequiredDocType {
  id: string
  typeId: string
  label: string
  required: boolean
  acceptedFormats: string[]   // mime types
  maxSizeMb: number
}

export const REQUIRED_DOC_TYPES: RequiredDocType[] = [
  {
    id: 'doc-id',
    typeId: 'admission',
    label: 'Identity document',
    required: true,
    acceptedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxSizeMb: 5,
  },
  {
    id: 'doc-marks',
    typeId: 'admission',
    label: 'Mark sheet',
    required: true,
    acceptedFormats: ['application/pdf'],
    maxSizeMb: 10,
  },
  {
    id: 'doc-fin-ref',
    typeId: 'finance',
    label: 'Fee receipt or reference',
    required: false,
    acceptedFormats: ['application/pdf', 'image/jpeg', 'image/png'],
    maxSizeMb: 5,
  },
  {
    id: 'doc-exam-paper',
    typeId: 'examination',
    label: 'Photocopy of answer script',
    required: true,
    acceptedFormats: ['application/pdf'],
    maxSizeMb: 15,
  },
]

// ─── Requester profile (mock current user) ────────────────────────────────────
export interface RequesterProfile {
  id: string
  name: string
  employeeId: string
  department: string
  category: string
  role: AnyRole
}

export const MOCK_REQUESTER: RequesterProfile = {
  id:          'usr-001',
  name:        'Admin User',
  employeeId:  'PU-2024-001',
  department:  'MIS Department',
  category:    'Staff',
  role:        'admin_dispatcher',
}
