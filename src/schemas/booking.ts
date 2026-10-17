import { z } from 'zod'

// ─── Step 1: Type and purpose ─────────────────────────────────────────────────
export const step1Schema = z.object({
  typeId:    z.string().min(1, 'Select an appointment type.'),
  purposeId: z.string(),
})

export function step1SchemaFor(requiresPurpose: boolean) {
  return z.object({
    typeId:    z.string().min(1, 'Select an appointment type.'),
    purposeId: requiresPurpose
      ? z.string().min(1, 'Select a purpose.')
      : z.string(),
  })
}

export type Step1Data = z.infer<typeof step1Schema>

// ─── Step 2: Authority ────────────────────────────────────────────────────────
export const step2Schema = z.object({
  authorityId:  z.string().min(1, 'Select an authority.'),
  autoAssigned: z.boolean(),
})

export type Step2Data = z.infer<typeof step2Schema>

// ─── Step 3: Date and time ────────────────────────────────────────────────────
// Date and time are OPTIONAL. Under the department's revised flow the authority
// proposes and confirms the slot during approval, so a requester may leave this
// blank ("let the authority propose a time"). When a date is chosen, a time
// must also be chosen (and vice versa), and both must be well formed.
export const step3Schema = z
  .object({
    date: z.string(),
    time: z.string(),
  })
  .superRefine((val, ctx) => {
    const hasDate = val.date.trim().length > 0
    const hasTime = val.time.trim().length > 0
    if (hasDate && !/^\d{4}-\d{2}-\d{2}$/.test(val.date)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a valid date.', path: ['date'] })
    }
    if (hasTime && !/^\d{2}:\d{2}$/.test(val.time)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a valid time.', path: ['time'] })
    }
    // If one is set, the other must be too.
    if (hasDate && !hasTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a time, or clear the date to let the authority propose one.', path: ['time'] })
    }
    if (hasTime && !hasDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select a date, or clear the time to let the authority propose one.', path: ['date'] })
    }
  })

export type Step3Data = z.infer<typeof step3Schema>

// Whether the requester has fully chosen a slot (both date and time present).
export function hasChosenSlot(date: string, time: string): boolean {
  return date.trim().length > 0 && time.trim().length > 0
}

// ─── Step 4: Details ─────────────────────────────────────────────────────────
// Zod v4: z.enum accepts an error option (not errorMap)
export const step4Schema = z.object({
  subject: z
    .string()
    .min(1, 'Enter a subject.')
    .max(120, 'Subject must be 120 characters or fewer.'),
  description: z.string().max(1000, 'Description must be 1000 characters or fewer.'),
  mode: z.enum(['physical', 'online', 'phone'] as const, {
    error: 'Select a meeting mode.',
  }),
  locationId:          z.string(),
  participantCount:    z.number().int().min(1).nullable().optional(),
  supportingReference: z.string().max(200).optional(),
})

export function step4SchemaFor(mode: string) {
  return step4Schema.extend({
    locationId:
      mode === 'physical'
        ? z.string().min(1, 'Select a location.')
        : z.string(),
  })
}

export type Step4Data = z.infer<typeof step4Schema>

// ─── Step 5: Documents ───────────────────────────────────────────────────────
export const uploadedDocSchema = z.object({
  docTypeId: z.string(),
  fileName:  z.string(),
  fileSize:  z.number().positive(),
  url:       z.string(),
})

export const step5Schema = z.object({
  documents: z.array(uploadedDocSchema),
})

export type UploadedDocData = z.infer<typeof uploadedDocSchema>
export type Step5Data       = z.infer<typeof step5Schema>

export function step5SchemaFor(requiredTypeIds: string[]) {
  return step5Schema.superRefine((val, ctx) => {
    for (const reqId of requiredTypeIds) {
      const found = val.documents.some(d => d.docTypeId === reqId)
      if (!found) {
        ctx.addIssue({
          code:    z.ZodIssueCode.custom,
          message: `Upload the required document for type "${reqId}".`,
          path:    ['documents'],
        })
      }
    }
  })
}

// ─── Step 6: Review ───────────────────────────────────────────────────────────
// Zod v4: z.literal does not accept an options object for custom messages.
// Use superRefine instead.
export const step6Schema = z.object({
  confirmed: z.boolean(),
}).superRefine((val, ctx) => {
  if (!val.confirmed) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      message: 'Confirm that the information is correct.',
      path:    ['confirmed'],
    })
  }
})

export type Step6Data = z.infer<typeof step6Schema>

// ─── Full draft schema ────────────────────────────────────────────────────────
export const bookingDraftSchema = z.object({
  id:                  z.string(),
  typeId:              z.string().min(1, 'Select an appointment type.'),
  purposeId:           z.string(),
  authorityId:         z.string().min(1, 'Select an authority.'),
  autoAssigned:        z.boolean(),
  date:                z.string(),   // optional — authority may propose the slot
  time:                z.string(),   // optional — authority may propose the slot
  subject:             z.string().min(1, 'Enter a subject.').max(120),
  description:         z.string().max(1000),
  mode:                z.enum(['physical', 'online', 'phone'] as const),
  locationId:          z.string(),
  participantCount:    z.number().int().min(1).nullable(),
  supportingReference: z.string().max(200),
  documents:           z.array(uploadedDocSchema),
})

export type BookingDraftData = z.infer<typeof bookingDraftSchema>
