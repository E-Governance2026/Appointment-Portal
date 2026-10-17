import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WizardShell, { type WizardStep } from '../components/appointment/WizardShell'
import Step1Type        from '../components/appointment/Step1Type'
import Step2Authority   from '../components/appointment/Step2Authority'
import Step3DateTime    from '../components/appointment/Step3DateTime'
import Step4Details     from '../components/appointment/Step4Details'
import Step5Review      from '../components/appointment/Step5Review'
import SuccessScreen    from '../components/appointment/SuccessScreen'
import { INITIAL_FORM_DATA, type AppointmentFormData } from '../types/appointment'

// ─── Wizard step config ───────────────────────────────────────────────────────
const STEPS: WizardStep[] = [
  { number: 1, label: 'Select Appointment Type', shortLabel: 'Type'       },
  { number: 2, label: 'Select Authority',         shortLabel: 'Authority'  },
  { number: 3, label: 'Select Date & Time',       shortLabel: 'Date & Time'},
  { number: 4, label: 'Appointment Details',       shortLabel: 'Details'    },
  { number: 5, label: 'Review & Submit',           shortLabel: 'Review'     },
]

// ─── Per-step validation ──────────────────────────────────────────────────────
function validate(
  step: number,
  data: AppointmentFormData
): Partial<Record<keyof AppointmentFormData, string>> {
  const errors: Partial<Record<keyof AppointmentFormData, string>> = {}

  if (step === 1) {
    if (!data.appointmentType) errors.appointmentType = 'Please select an appointment type.'
  }
  if (step === 2) {
    if (!data.department)  errors.department  = 'Please select a department.'
    if (!data.authorityId) errors.authorityId = 'Please select an authority.'
  }
  if (step === 3) {
    if (!data.date)     errors.date     = 'Please select a date.'
    if (!data.timeSlot) errors.timeSlot = 'Please select a time slot.'
  }
  if (step === 4) {
    if (!data.subject.trim())  errors.subject  = 'Subject is required.'
    if (!data.purpose)         errors.purpose  = 'Please select a purpose.'
    if (data.meetingMode === 'physical' && !data.location.trim())
      errors.location = 'Please enter the meeting location.'
  }
  if (step === 5) {
    if (!data.confirmed) errors.confirmed = 'Please confirm the information.'
  }
  return errors
}

// ─── Generate appointment ID ──────────────────────────────────────────────────
function generateAppointmentId(): string {
  const year = new Date().getFullYear()
  const num  = Math.floor(100000 + Math.random() * 900000)
  return `APT-${year}-${num}`
}

// ─── BookAppointment Page ─────────────────────────────────────────────────────
export default function BookAppointment() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep]   = useState(1)
  const [formData, setFormData]         = useState<AppointmentFormData>(INITIAL_FORM_DATA)
  const [errors, setErrors]             = useState<Partial<Record<keyof AppointmentFormData, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [appointmentId, setAppointmentId] = useState('')

  function updateForm(updates: Partial<AppointmentFormData>) {
    setFormData(prev => ({ ...prev, ...updates }))
    // Clear related errors
    const clearedKeys = Object.keys(updates) as (keyof AppointmentFormData)[]
    setErrors(prev => {
      const next = { ...prev }
      clearedKeys.forEach(k => delete next[k])
      return next
    })
  }

  function handleNext() {
    const stepErrors = validate(currentStep, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setErrors({})
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1)
    } else {
      handleSubmit()
    }
  }

  function handleBack() {
    setErrors({})
    setCurrentStep(prev => Math.max(1, prev - 1))
  }

  function handleEditStep(step: number) {
    setErrors({})
    setCurrentStep(step)
  }

  async function handleSubmit() {
    const stepErrors = validate(5, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }
    setIsSubmitting(true)
    // Simulate API call — replace with real endpoint in backend integration
    await new Promise(resolve => setTimeout(resolve, 1500))
    const id = generateAppointmentId()
    setAppointmentId(id)
    setIsSubmitting(false)
    setSubmitted(true)
  }

  // ── Determine if Next should be disabled ──
  function isNextDisabled(): boolean {
    if (currentStep === 1) return !formData.appointmentType
    if (currentStep === 2) return !formData.department || !formData.authorityId
    if (currentStep === 3) return !formData.date || !formData.timeSlot
    if (currentStep === 4) {
      if (!formData.subject.trim() || !formData.purpose) return true
      if (formData.meetingMode === 'physical' && !formData.location.trim()) return true
    }
    if (currentStep === 5) return !formData.confirmed
    return false
  }

  // ── Render current step ──
  function renderStep() {
    switch (currentStep) {
      case 1: return <Step1Type     data={formData} onChange={updateForm} />
      case 2: return <Step2Authority data={formData} onChange={updateForm} />
      case 3: return <Step3DateTime  data={formData} onChange={updateForm} />
      case 4: return <Step4Details   data={formData} onChange={updateForm} errors={errors} />
      case 5: return (
        <Step5Review
          data={formData}
          onChange={updateForm}
          onEditStep={handleEditStep}
        />
      )
      default: return null
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-5">
        <h1 className="page-title">Book Appointment</h1>
        <p className="page-subtitle">
          Schedule a meeting with Parul University authorities in a few easy steps.
        </p>
      </div>

      <div className="max-w-3xl">
        {submitted ? (
          /* ── Success screen ── */
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-md)',
              padding: '2rem',
            }}
          >
            <SuccessScreen appointmentId={appointmentId} data={formData} />
          </div>
        ) : (
          /* ── Wizard ── */
          <WizardShell
            steps={STEPS}
            currentStep={currentStep}
            onNext={handleNext}
            onBack={handleBack}
            onCancel={() => navigate('/dashboard')}
            nextDisabled={isNextDisabled()}
            isLastStep={currentStep === STEPS.length}
            isSubmitting={isSubmitting}
            nextLabel={currentStep === STEPS.length ? 'Submit Appointment' : undefined}
          >
            {renderStep()}

            {/* Inline validation errors banner */}
            {Object.keys(errors).length > 0 && currentStep !== 4 && (
              <div
                className="mt-4 p-3 rounded-xl text-xs"
                style={{
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                }}
              >
                {Object.values(errors)[0]}
              </div>
            )}
          </WizardShell>
        )}
      </div>
    </div>
  )
}
