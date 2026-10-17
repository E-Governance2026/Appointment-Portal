// ─── Shared Appointment Types ─────────────────────────────────────────────────
// Used across the booking wizard, my appointments, approvals, etc.

export interface AppointmentFormData {
  // Step 1
  appointmentType: string
  appointmentTypeLabel: string
  appointmentTypeIcon: string

  // Step 2
  department: string
  departmentLabel: string
  authorityId: string
  authorityName: string
  authorityDesignation: string

  // Step 3
  date: string          // ISO yyyy-mm-dd
  timeSlot: string      // e.g. "09:30 AM"

  // Step 4
  subject: string
  purpose: string
  description: string
  meetingMode: 'physical' | 'online' | 'phone'
  location: string
  documents: File[]

  // Step 5 (meta)
  confirmed: boolean
}

export const INITIAL_FORM_DATA: AppointmentFormData = {
  appointmentType: '',
  appointmentTypeLabel: '',
  appointmentTypeIcon: '',
  department: '',
  departmentLabel: '',
  authorityId: '',
  authorityName: '',
  authorityDesignation: '',
  date: '',
  timeSlot: '',
  subject: '',
  purpose: '',
  description: '',
  meetingMode: 'physical',
  location: '',
  documents: [],
  confirmed: false,
}

// ─── Appointment Types ────────────────────────────────────────────────────────
export interface AppointmentType {
  id: string
  label: string
  emoji: string
  color: string
  bg: string
}

export const APPOINTMENT_TYPES: AppointmentType[] = [
  { id: 'student',   label: 'Student Related', emoji: '🎓', color: '#073B35', bg: 'rgba(7,59,53,0.08)'   },
  { id: 'academic',  label: 'Academic',         emoji: '📚', color: '#0F806B', bg: 'rgba(15,128,107,0.08)'},
  { id: 'admission', label: 'Admission Related',emoji: '📋', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)'},
  { id: 'exam',      label: 'Examination',      emoji: '📝', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)'},
  { id: 'finance',   label: 'Finance / Fees',   emoji: '💰', color: '#F4A340', bg: 'rgba(244,163,64,0.1)' },
  { id: 'hr',        label: 'HR / Employee',    emoji: '👥', color: '#EC4899', bg: 'rgba(236,72,153,0.08)'},
  { id: 'visitor',   label: 'Visitor / External',emoji: '🏢', color: '#14B8A6', bg: 'rgba(20,184,166,0.08)'},
  { id: 'general',   label: 'General Meeting',  emoji: '🤝', color: '#6B7280', bg: 'rgba(107,114,128,0.08)'},
]

// ─── Departments ──────────────────────────────────────────────────────────────
export interface Department {
  id: string
  label: string
}

export const DEPARTMENTS: Department[] = [
  { id: 'admissions',  label: 'Admissions'         },
  { id: 'academic',    label: 'Academic Affairs'   },
  { id: 'registrar',   label: 'Registrar'          },
  { id: 'finance',     label: 'Finance'            },
  { id: 'hr',          label: 'Human Resources'    },
  { id: 'exam',        label: 'Examination Cell'   },
  { id: 'library',     label: 'Library'            },
  { id: 'hostel',      label: 'Hostel'             },
  { id: 'it',          label: 'IT Department'      },
  { id: 'research',    label: 'Research & Dev'     },
]

// ─── Authorities ──────────────────────────────────────────────────────────────
export interface Authority {
  id: string
  name: string
  designation: string
  department: string
  avatar: string
  available: boolean
}

export const AUTHORITIES: Authority[] = [
  { id: 'a1', name: 'Dr. Rajesh Kumar',    designation: 'Head of Admissions',      department: 'admissions', avatar: 'RK', available: true  },
  { id: 'a2', name: 'Prof. Sneha Shah',    designation: 'Academic Coordinator',    department: 'academic',   avatar: 'SS', available: true  },
  { id: 'a3', name: 'Mr. Vivek Mehta',     designation: 'Registrar',               department: 'registrar',  avatar: 'VM', available: false },
  { id: 'a4', name: 'Ms. Priya Desai',     designation: 'Finance Officer',         department: 'finance',    avatar: 'PD', available: true  },
  { id: 'a5', name: 'Dr. Amit Patel',      designation: 'HR Manager',              department: 'hr',         avatar: 'AP', available: true  },
  { id: 'a6', name: 'Prof. Neha Joshi',    designation: 'Controller of Exams',     department: 'exam',       avatar: 'NJ', available: true  },
  { id: 'a7', name: 'Mr. Kiran Thakkar',   designation: 'IT Administrator',        department: 'it',         avatar: 'KT', available: true  },
  { id: 'a8', name: 'Dr. Meera Verma',     designation: 'Research Director',       department: 'research',   avatar: 'MV', available: false },
]

// ─── Time Slots ───────────────────────────────────────────────────────────────
export interface TimeSlot {
  time: string
  status: 'available' | 'booked' | 'break'
}

export const generateTimeSlots = (): TimeSlot[] => [
  { time: '09:00 AM', status: 'booked'    },
  { time: '09:30 AM', status: 'available' },
  { time: '10:00 AM', status: 'available' },
  { time: '10:30 AM', status: 'booked'    },
  { time: '11:00 AM', status: 'available' },
  { time: '11:30 AM', status: 'available' },
  { time: '12:00 PM', status: 'break'     },
  { time: '12:30 PM', status: 'break'     },
  { time: '01:00 PM', status: 'available' },
  { time: '01:30 PM', status: 'booked'    },
  { time: '02:00 PM', status: 'available' },
  { time: '02:30 PM', status: 'available' },
  { time: '03:00 PM', status: 'booked'    },
  { time: '03:30 PM', status: 'available' },
  { time: '04:00 PM', status: 'available' },
  { time: '04:30 PM', status: 'available' },
  { time: '05:00 PM', status: 'booked'    },
  { time: '05:30 PM', status: 'available' },
]

export const PURPOSE_OPTIONS = [
  'Academic Discussion',
  'Fee Payment / Query',
  'Document Submission',
  'Counselling',
  'Official Meeting',
  'Grievance',
  'Research Discussion',
  'HR Query',
  'Admission Query',
  'General Enquiry',
  'Other',
]
