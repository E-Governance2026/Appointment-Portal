import { describe, it, expect } from 'vitest'
import {
  step1SchemaFor,
  step2Schema,
  step3Schema,
  step4Schema,
  step4SchemaFor,
  step5SchemaFor,
  step6Schema,
} from '../schemas/booking'

// ─── Step 1 ───────────────────────────────────────────────────────────────────
describe('step1Schema', () => {
  it('rejects missing typeId', () => {
    const r = step1SchemaFor(false).safeParse({ typeId: '', purposeId: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msgs = r.error.flatten().fieldErrors.typeId
      expect(msgs?.[0]).toBe('Select an appointment type.')
    }
  })

  it('accepts typeId without purpose when requiresPurpose is false', () => {
    const r = step1SchemaFor(false).safeParse({ typeId: 'academic', purposeId: '' })
    expect(r.success).toBe(true)
  })

  it('rejects missing purpose when requiresPurpose is true', () => {
    const r = step1SchemaFor(true).safeParse({ typeId: 'academic', purposeId: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msgs = r.error.flatten().fieldErrors.purposeId
      expect(msgs?.[0]).toBe('Select a purpose.')
    }
  })

  it('accepts typeId and purpose when requiresPurpose is true', () => {
    const r = step1SchemaFor(true).safeParse({ typeId: 'academic', purposeId: 'acad-disc' })
    expect(r.success).toBe(true)
  })
})

// ─── Step 2 ───────────────────────────────────────────────────────────────────
describe('step2Schema', () => {
  it('rejects missing authorityId', () => {
    const r = step2Schema.safeParse({ authorityId: '', autoAssigned: false })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msgs = r.error.flatten().fieldErrors.authorityId
      expect(msgs?.[0]).toBe('Select an authority.')
    }
  })

  it('accepts a valid authorityId', () => {
    const r = step2Schema.safeParse({ authorityId: 'auth-ss', autoAssigned: false })
    expect(r.success).toBe(true)
  })

  it('accepts autoAssigned with any authorityId', () => {
    const r = step2Schema.safeParse({ authorityId: 'auto', autoAssigned: true })
    expect(r.success).toBe(true)
  })
})

// ─── Step 3 ───────────────────────────────────────────────────────────────────
describe('step3Schema', () => {
  // Revised flow: date and time are optional (authority may propose the slot).
  it('accepts both date and time empty (authority will propose a time)', () => {
    const r = step3Schema.safeParse({ date: '', time: '' })
    expect(r.success).toBe(true)
  })

  it('rejects a date with no time (the pair must be complete)', () => {
    const r = step3Schema.safeParse({ date: '2026-10-20', time: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.time?.[0]).toMatch(/Select a time/)
    }
  })

  it('rejects a time with no date (the pair must be complete)', () => {
    const r = step3Schema.safeParse({ date: '', time: '09:00' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.date?.[0]).toMatch(/Select a date/)
    }
  })

  it('rejects malformed date', () => {
    const r = step3Schema.safeParse({ date: '14-10-2026', time: '09:00' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.date?.[0]).toBe('Select a valid date.')
    }
  })

  it('rejects malformed time', () => {
    const r = step3Schema.safeParse({ date: '2026-10-20', time: '9:00 AM' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.time?.[0]).toBe('Select a valid time.')
    }
  })

  it('accepts valid date and time', () => {
    const r = step3Schema.safeParse({ date: '2026-10-20', time: '09:30' })
    expect(r.success).toBe(true)
  })
})

// ─── Step 4 ───────────────────────────────────────────────────────────────────
describe('step4Schema', () => {
  const base = {
    subject: 'Course query', description: '', mode: 'online' as const,
    locationId: '', participantCount: null, supportingReference: '',
  }

  it('rejects empty subject', () => {
    const r = step4Schema.safeParse({ ...base, subject: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.subject?.[0]).toBe('Enter a subject.')
    }
  })

  it('rejects subject over 120 characters', () => {
    const r = step4Schema.safeParse({ ...base, subject: 'a'.repeat(121) })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.subject?.[0]).toBe('Subject must be 120 characters or fewer.')
    }
  })

  it('rejects description over 1000 characters', () => {
    const r = step4Schema.safeParse({ ...base, description: 'x'.repeat(1001) })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.description?.[0]).toContain('1000')
    }
  })

  it('accepts valid data for online mode', () => {
    const r = step4Schema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('requires locationId for physical mode', () => {
    const r = step4SchemaFor('physical').safeParse({ ...base, mode: 'physical', locationId: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.locationId?.[0]).toBe('Select a location.')
    }
  })

  it('does not require locationId for online mode', () => {
    const r = step4SchemaFor('online').safeParse({ ...base, mode: 'online', locationId: '' })
    expect(r.success).toBe(true)
  })

  it('rejects invalid mode', () => {
    const r = step4Schema.safeParse({ ...base, mode: 'carrier_pigeon' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.mode?.[0]).toBe('Select a meeting mode.')
    }
  })
})

// ─── Step 5 ───────────────────────────────────────────────────────────────────
describe('step5Schema', () => {
  const mockDoc = { docTypeId: 'doc-id', fileName: 'id.pdf', fileSize: 102400, url: 'blob:x' }

  it('passes when all required types are uploaded', () => {
    const schema = step5SchemaFor(['doc-id'])
    const r = schema.safeParse({ documents: [mockDoc] })
    expect(r.success).toBe(true)
  })

  it('fails when a required type is missing', () => {
    const schema = step5SchemaFor(['doc-id', 'doc-marks'])
    const r = schema.safeParse({ documents: [mockDoc] })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('doc-marks')
    }
  })

  it('passes with no required types and empty documents', () => {
    const schema = step5SchemaFor([])
    const r = schema.safeParse({ documents: [] })
    expect(r.success).toBe(true)
  })
})

// ─── Step 6 ───────────────────────────────────────────────────────────────────
describe('step6Schema', () => {
  it('rejects confirmed = false', () => {
    const r = step6Schema.safeParse({ confirmed: false })
    expect(r.success).toBe(false)
  })

  it('accepts confirmed = true', () => {
    const r = step6Schema.safeParse({ confirmed: true })
    expect(r.success).toBe(true)
  })
})
