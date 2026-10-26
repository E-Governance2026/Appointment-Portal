// ─── Approval Queue Data ──────────────────────────────────────────────────────
// Richer appointment records for the approvals workflow (PRD §6.12, §7).
// Each record carries the assigned approval stage + role, which decides who
// may act on it. This mirrors the eventual `appointments` + `approval_stages`
// tables in Supabase.

import type { AppointmentStatus } from './mockAppointments'
import type { Role } from '../config/permissions'

// ─── Approval record ────────────────────────────────────────────────────────────
export interface ApprovalRecord {
  id:            string          // APT-2026-xxxx
  requester:     string
  requesterInitials: string
  requesterCategory: string      // Staff / Student / External
  typeId:        string
  typeName:      string
  purposeLabel:  string
  department:    string
  authorityId:   string
  authorityName: string
  date:          string          // ISO yyyy-mm-dd
  time:          string          // HH:MM
  subject:       string
  description:   string
  mode:          'physical' | 'online' | 'phone'
  locationLabel: string
  meetingUrl?:   string
  documentsCount: number
  status:        AppointmentStatus
  submittedAt:   string          // ISO
  // Who the request is currently assigned to for action.
  assignedStage: string          // e.g. 'Authority review'
  assignedRole:  Role            // which role may act now
  assignedToId:  string          // which authority/coordinator id
  updatedAt:     string
  // Reschedule proposal — set when an authority/coordinator proposes a new
  // slot. The requester accepts (-> confirmed) or declines (-> cancelled).
  proposedDate?: string          // ISO yyyy-mm-dd
  proposedTime?: string          // HH:MM
  // Visit tracking (reception desk). check-in / check-out are audit actions,
  // not statuses: the status stays 'confirmed' through the visit and becomes
  // 'completed' on check-out.
  checkedInAt?:  string          // ISO datetime
  checkedOutAt?: string          // ISO datetime
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
const TODAY = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})()

export const SEED_APPROVALS: ApprovalRecord[] = [
  {
    id: 'APT-2026-2001',
    requester: 'Rohan Mehta', requesterInitials: 'RM', requesterCategory: 'Staff',
    typeId: 'academic', typeName: 'Academic Consultation',
    purposeLabel: 'Academic guidance',
    department: 'Academic Affairs',
    authorityId: 'auth-ss', authorityName: 'Prof. Sneha Shah',
    date: '', time: '',   // requester left the slot open — authority sets it at approval
    subject: 'Course registration guidance',
    description: 'Need guidance on elective selection for next semester.',
    mode: 'physical', locationLabel: 'Academic Block – Room 204', documentsCount: 1,
    status: 'submitted',
    submittedAt: `${TODAY}T08:05:00`,
    assignedStage: 'Authority review', assignedRole: 'coordinator_authority', assignedToId: 'auth-ss',
    updatedAt: `${TODAY}T08:05:00`,
  },
  {
    id: 'APT-2026-2002',
    requester: 'Priya Sharma', requesterInitials: 'PS', requesterCategory: 'Staff',
    typeId: 'finance', typeName: 'Finance / Accounts',
    purposeLabel: 'Fees or accounts discussion',
    department: 'Finance',
    authorityId: 'auth-pd', authorityName: 'Ms. Priya Desai',
    date: TODAY, time: '11:00',
    subject: 'Scholarship disbursement query',
    description: 'Clarification on the delayed scholarship payment.',
    mode: 'online', locationLabel: '', documentsCount: 2,
    status: 'submitted',
    submittedAt: `${TODAY}T07:40:00`,
    assignedStage: 'Coordinator review', assignedRole: 'coordinator_authority', assignedToId: 'u-ca',
    updatedAt: `${TODAY}T07:40:00`,
  },
  {
    id: 'APT-2026-2003',
    requester: 'Amit Patel', requesterInitials: 'AP', requesterCategory: 'Staff',
    typeId: 'hr', typeName: 'Staff Related',
    purposeLabel: 'Staff issue, guidance',
    department: 'Human Resources',
    authorityId: 'auth-ap', authorityName: 'Dr. Amit Patel',
    date: TODAY, time: '14:00',
    subject: 'Leave policy clarification',
    description: '',
    mode: 'phone', locationLabel: '', documentsCount: 0,
    status: 'additional-info',
    submittedAt: `${TODAY}T06:15:00`,
    assignedStage: 'Awaiting requester', assignedRole: 'coordinator_authority', assignedToId: 'auth-ap',
    updatedAt: `${TODAY}T09:10:00`,
  },
  {
    id: 'APT-2026-2004',
    requester: 'Neha Jain', requesterInitials: 'NJ', requesterCategory: 'Student',
    typeId: 'examination', typeName: 'Examination Related',
    purposeLabel: 'Result or evaluation issue',
    department: 'Examination Cell',
    authorityId: 'auth-nj', authorityName: 'Prof. Neha Joshi',
    date: TODAY, time: '15:30',
    subject: 'Re-evaluation request',
    description: 'Requesting re-evaluation of mid-term paper.',
    mode: 'physical', locationLabel: 'Examination Cell Office', documentsCount: 1,
    status: 'approved',
    submittedAt: `${TODAY}T05:50:00`,
    assignedStage: 'Confirmation pending', assignedRole: 'coordinator_authority', assignedToId: 'auth-nj',
    updatedAt: `${TODAY}T10:00:00`,
  },
  {
    id: 'APT-2026-2005',
    requester: 'Vikram Singh', requesterInitials: 'VS', requesterCategory: 'Staff',
    typeId: 'general', typeName: 'General / Official Meeting',
    purposeLabel: 'Official discussion',
    department: 'Registrar',
    authorityId: 'auth-vm', authorityName: 'Mr. Vivek Mehta',
    date: TODAY, time: '16:00',
    subject: 'Bonafide certificate approval',
    description: '',
    mode: 'physical', locationLabel: 'Registrar Office', documentsCount: 0,
    status: 'confirmed',
    submittedAt: `${TODAY}T04:30:00`,
    assignedStage: 'Confirmed', assignedRole: 'coordinator_authority', assignedToId: 'auth-vm',
    updatedAt: `${TODAY}T11:20:00`,
  },
  {
    id: 'APT-2026-2006',
    requester: 'Kavya Reddy', requesterInitials: 'KR', requesterCategory: 'Student',
    typeId: 'academic', typeName: 'Academic Consultation',
    purposeLabel: 'Course-related discussion',
    department: 'Academic Affairs',
    authorityId: 'auth-ss', authorityName: 'Prof. Sneha Shah',
    date: '', time: '',   // requester left the slot open — authority sets it at approval
    subject: 'Project supervision request',
    description: 'Requesting supervision for the final-year project.',
    mode: 'physical', locationLabel: 'Academic Block – Room 204', documentsCount: 3,
    status: 'submitted',
    submittedAt: `${TODAY}T08:50:00`,
    assignedStage: 'Authority review', assignedRole: 'coordinator_authority', assignedToId: 'auth-ss',
    updatedAt: `${TODAY}T08:50:00`,
  },
  {
    id: 'APT-2026-2007',
    requester: 'Suresh Kumar', requesterInitials: 'SK', requesterCategory: 'Staff',
    typeId: 'document', typeName: 'Document Verification',
    purposeLabel: 'Document review or verification',
    department: 'Registrar',
    authorityId: 'auth-vm', authorityName: 'Mr. Vivek Mehta',
    date: '2026-10-12', time: '11:00',
    subject: 'Experience letter verification',
    description: '',
    mode: 'physical', locationLabel: 'Registrar Office', documentsCount: 2,
    status: 'completed',
    submittedAt: '2026-10-11T09:00:00',
    assignedStage: 'Completed', assignedRole: 'coordinator_authority', assignedToId: 'auth-vm',
    updatedAt: '2026-10-12T12:00:00',
  },
  {
    id: 'APT-2026-2008',
    requester: 'Meera Verma', requesterInitials: 'MV', requesterCategory: 'Staff',
    typeId: 'training', typeName: 'Training / Workshop',
    purposeLabel: 'Training-related discussion',
    department: 'Human Resources',
    authorityId: 'auth-ap', authorityName: 'Dr. Amit Patel',
    date: '2026-10-10', time: '10:00',
    subject: 'Workshop scheduling',
    description: 'Proposal to schedule a data-protection workshop.',
    mode: 'online', locationLabel: '', documentsCount: 0,
    status: 'rejected',
    submittedAt: '2026-10-09T08:00:00',
    assignedStage: 'Rejected', assignedRole: 'coordinator_authority', assignedToId: 'auth-ap',
    updatedAt: '2026-10-09T15:00:00',
  },
]
