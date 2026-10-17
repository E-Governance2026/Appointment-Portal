import { create } from 'zustand'
import type { MeetingMode, UploadedDoc, BookingDraft } from '../data/bookingApi'

// ─── Booking step indices (1-based, matching the UI) ─────────────────────────
export const STEP_COUNT = 6
export const STEP_LABELS = [
  'Type and purpose',
  'Authority',
  'Date and time (optional)',
  'Details',
  'Documents',
  'Review and submit',
] as const

// ─── Per-step validation state ────────────────────────────────────────────────
export type StepErrors = Partial<Record<string, string>>

// ─── Upload state for a single document slot ─────────────────────────────────
export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

export interface DocUploadSlot {
  docTypeId:   string
  uploadStatus: UploadStatus
  progress:    number   // 0-100
  error?:      string
  doc?:        UploadedDoc
}

// ─── The full booking form state ──────────────────────────────────────────────
export interface BookingState {
  // Draft metadata
  draftId:   string        // empty until first save
  isDirty:   boolean       // unsaved changes exist

  // Step 1
  typeId:    string
  purposeId: string

  // Step 2
  authorityId:  string
  autoAssigned: boolean

  // Step 3
  date: string   // ISO yyyy-mm-dd
  time: string   // HH:MM

  // Step 4
  subject:             string
  description:         string
  mode:                MeetingMode
  locationId:          string
  participantCount:    number | null
  supportingReference: string

  // Step 5
  docSlots: DocUploadSlot[]   // one entry per required + optional doc

  // Navigation
  currentStep:  number        // 1-based
  stepErrors:   StepErrors[]  // index 0 = step 1 errors

  // Submission
  isSubmitting:     boolean
  submittedId:      string   // non-empty after successful submit
  submitError:      string
  idempotencyKey:   string
}

// ─── Actions ──────────────────────────────────────────────────────────────────
export interface BookingActions {
  // Step 1
  setType:    (typeId: string)    => void
  setPurpose: (purposeId: string) => void

  // Step 2
  setAuthority:    (authorityId: string) => void
  setAutoAssigned: (v: boolean)          => void

  // Step 3
  setDate: (date: string) => void
  setTime: (time: string) => void

  // Step 4
  setSubject:             (v: string)          => void
  setDescription:         (v: string)          => void
  setMode:                (v: MeetingMode)      => void
  setLocationId:          (v: string)          => void
  setParticipantCount:    (v: number | null)    => void
  setSupportingReference: (v: string)          => void

  // Step 5
  initDocSlots:     (slots: DocUploadSlot[])                          => void
  updateDocSlot:    (docTypeId: string, patch: Partial<DocUploadSlot>) => void
  removeDocSlot:    (docTypeId: string)                               => void
  addOptionalSlot:  ()                                                => void

  // Navigation
  goToStep:    (step: number)            => void
  setErrors:   (step: number, e: StepErrors) => void
  clearErrors: (step: number)            => void

  // Draft
  setDraftId: (id: string) => void
  markClean:  ()           => void

  // Submission
  setSubmitting:  (v: boolean)  => void
  setSubmittedId: (id: string)  => void
  setSubmitError: (msg: string) => void

  // Load draft into store
  hydrate: (draft: BookingDraft) => void

  // Reset everything (e.g. "Book another appointment")
  reset: () => void
}

// ─── Initial state ────────────────────────────────────────────────────────────
const INITIAL: BookingState = {
  draftId:   '',
  isDirty:   false,
  typeId:    '',
  purposeId: '',
  authorityId:  '',
  autoAssigned: false,
  date: '',
  time: '',
  subject:             '',
  description:         '',
  mode:                'physical',
  locationId:          '',
  participantCount:    null,
  supportingReference: '',
  docSlots:    [],
  currentStep: 1,
  stepErrors:  Array.from({ length: STEP_COUNT }, () => ({})),
  isSubmitting:   false,
  submittedId:    '',
  submitError:    '',
  idempotencyKey: crypto.randomUUID(),
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useBookingStore = create<BookingState & BookingActions>((set, get) => ({
  ...INITIAL,

  // ── Step 1 ──────────────────────────────────────────────────────────────────
  setType: (typeId) =>
    set(s => ({
      typeId,
      purposeId:   typeId !== s.typeId ? '' : s.purposeId,
      // Changing type clears downstream steps
      authorityId: typeId !== s.typeId ? '' : s.authorityId,
      date:        typeId !== s.typeId ? '' : s.date,
      time:        typeId !== s.typeId ? '' : s.time,
      isDirty: true,
    })),

  setPurpose: (purposeId) => set({ purposeId, isDirty: true }),

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  setAuthority: (authorityId) =>
    set(s => ({
      authorityId,
      // Changing authority clears slot selection
      date: authorityId !== s.authorityId ? '' : s.date,
      time: authorityId !== s.authorityId ? '' : s.time,
      isDirty: true,
    })),

  setAutoAssigned: (autoAssigned) => set({ autoAssigned, isDirty: true }),

  // ── Step 3 ──────────────────────────────────────────────────────────────────
  setDate: (date) =>
    set(s => ({
      date,
      time: date !== s.date ? '' : s.time,
      isDirty: true,
    })),

  setTime: (time) => set({ time, isDirty: true }),

  // ── Step 4 ──────────────────────────────────────────────────────────────────
  setSubject:             (subject)             => set({ subject,             isDirty: true }),
  setDescription:         (description)         => set({ description,         isDirty: true }),
  setMode:                (mode)                => set({ mode, locationId: '', isDirty: true }),
  setLocationId:          (locationId)          => set({ locationId,          isDirty: true }),
  setParticipantCount:    (participantCount)     => set({ participantCount,    isDirty: true }),
  setSupportingReference: (supportingReference) => set({ supportingReference, isDirty: true }),

  // ── Step 5 ──────────────────────────────────────────────────────────────────
  initDocSlots: (docSlots) => set({ docSlots, isDirty: true }),

  updateDocSlot: (docTypeId, patch) =>
    set(s => ({
      docSlots: s.docSlots.map(slot =>
        slot.docTypeId === docTypeId ? { ...slot, ...patch } : slot,
      ),
      isDirty: true,
    })),

  removeDocSlot: (docTypeId) =>
    set(s => ({
      docSlots: s.docSlots.filter(slot => slot.docTypeId !== docTypeId),
      isDirty: true,
    })),

  addOptionalSlot: () =>
    set(s => ({
      docSlots: [
        ...s.docSlots,
        {
          docTypeId:    `opt-${Date.now()}`,
          uploadStatus: 'idle' as const,
          progress:     0,
        },
      ],
      isDirty: true,
    })),

  // ── Navigation ───────────────────────────────────────────────────────────────
  goToStep: (step) => set({ currentStep: step }),

  setErrors: (step, errors) =>
    set(s => {
      const next = [...s.stepErrors]
      next[step - 1] = errors
      return { stepErrors: next }
    }),

  clearErrors: (step) =>
    set(s => {
      const next = [...s.stepErrors]
      next[step - 1] = {}
      return { stepErrors: next }
    }),

  // ── Draft ────────────────────────────────────────────────────────────────────
  setDraftId: (draftId) => set({ draftId }),
  markClean:  ()        => set({ isDirty: false }),

  // ── Submission ────────────────────────────────────────────────────────────────
  setSubmitting:  (isSubmitting)  => set({ isSubmitting }),
  setSubmittedId: (submittedId)   => set({ submittedId }),
  setSubmitError: (submitError)   => set({ submitError }),

  // ── Hydrate from saved draft ──────────────────────────────────────────────────
  hydrate: (draft) =>
    set({
      draftId:             draft.id,
      typeId:              draft.typeId,
      purposeId:           draft.purposeId,
      authorityId:         draft.authorityId,
      autoAssigned:        draft.autoAssigned,
      date:                draft.date,
      time:                draft.time,
      subject:             draft.subject,
      description:         draft.description,
      mode:                draft.mode,
      locationId:          draft.locationId,
      participantCount:    draft.participantCount,
      supportingReference: draft.supportingReference,
      docSlots:            draft.documents.map(d => ({
        docTypeId:    d.docTypeId,
        uploadStatus: 'done' as const,
        progress:     100,
        doc:          d,
      })),
      isDirty: false,
    }),

  // ── Reset ─────────────────────────────────────────────────────────────────────
  reset: () =>
    set({
      ...INITIAL,
      idempotencyKey: crypto.randomUUID(),
      stepErrors: Array.from({ length: STEP_COUNT }, () => ({})),
    }),
}))

// ─── Selector helpers (avoid repeated inline selectors) ──────────────────────
export const selectStep1 = (s: BookingState) => ({
  typeId: s.typeId, purposeId: s.purposeId,
})
export const selectStep2 = (s: BookingState) => ({
  authorityId: s.authorityId, autoAssigned: s.autoAssigned,
})
export const selectStep3 = (s: BookingState) => ({
  date: s.date, time: s.time,
})
export const selectStep4 = (s: BookingState) => ({
  subject: s.subject, description: s.description,
  mode: s.mode, locationId: s.locationId,
  participantCount: s.participantCount,
  supportingReference: s.supportingReference,
})
export const selectDocSlots = (s: BookingState) => s.docSlots

/** Convert store state to the BookingDraft shape needed by the API. */
export function storeToApiDraft(s: BookingState): Omit<BookingDraft, 'status' | 'createdAt' | 'updatedAt'> {
  return {
    id:                  s.draftId,
    typeId:              s.typeId,
    purposeId:           s.purposeId,
    authorityId:         s.authorityId,
    autoAssigned:        s.autoAssigned,
    date:                s.date,
    time:                s.time,
    subject:             s.subject,
    description:         s.description,
    mode:                s.mode,
    locationId:          s.locationId,
    participantCount:    s.participantCount,
    supportingReference: s.supportingReference,
    documents:           s.docSlots
      .filter(slot => slot.doc)
      .map(slot => slot.doc!),
  }
}
