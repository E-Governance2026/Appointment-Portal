import { useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload, X, FileText, AlertCircle, CheckCircle2, Plus } from 'lucide-react'
import { fetchRequiredDocTypes, uploadDocument } from '../../data/bookingApi'
import { useBookingStore } from '../../store/bookingStore'
import type { DocUploadSlot } from '../../store/bookingStore'
import { useSessionManager } from '../session/SessionManager'


// ─── Single upload row ────────────────────────────────────────────────────────
function UploadRow({
  slot,
  label,
  required,
  acceptedFormats,
  maxSizeMb,
  typeId,
  onFileChosen,
  onRemove,
}: {
  slot:            DocUploadSlot
  label:           string
  required:        boolean
  acceptedFormats: string[]
  maxSizeMb:       number
  typeId:          string
  onFileChosen:    (file: File) => void
  onRemove:        () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isDone = slot.uploadStatus === 'done'
  const isErr  = slot.uploadStatus === 'error'
  const isUp   = slot.uploadStatus === 'uploading'

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) onFileChosen(file)
  }

  return (
    <div
      style={{
        border:          `1.5px solid ${isErr ? 'var(--color-danger)' : isDone ? 'var(--color-emerald)' : 'var(--color-sage)'}`,
        borderRadius:    '8px',
        padding:         '14px 16px',
        display:         'flex',
        flexDirection:   'column',
        gap:             '10px',
        backgroundColor: isDone ? 'rgba(15,128,107,0.04)' : 'transparent',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px', color: 'var(--color-charcoal)', margin: 0 }}>
          {label}
          {required && <span style={{ color: 'var(--color-danger)', marginLeft: '4px' }}>*</span>}
        </p>
        {isDone && <CheckCircle2 size={16} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} aria-hidden="true" />}
      </div>

      {/* Drop zone / file info */}
      {!isDone && !isUp && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Choose file for ${label}`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{
            border:          '2px dashed var(--color-sage)',
            borderRadius:    '6px',
            padding:         '20px',
            textAlign:       'center',
            cursor:          'pointer',
            backgroundColor: 'var(--color-bg)',
          }}
          onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
          onBlur={e  => (e.currentTarget.style.outline = 'none')}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-emerald)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-sage)')}
        >
          <Upload size={20} style={{ color: 'var(--color-text-secondary)', margin: '0 auto 6px' }} aria-hidden="true" />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-charcoal)', margin: '0 0 4px 0' }}>
            Drag and drop, or <span style={{ color: 'var(--color-emerald)', fontWeight: 600 }}>browse</span>
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 }}>
            PDF, DOCX, JPG, PNG — max {maxSizeMb} MB
          </p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFileChosen(f); e.target.value = '' }}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* Upload progress */}
      {isUp && (
        <div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-charcoal)', marginBottom: '6px' }}>
            Uploading... {slot.progress}%
          </p>
          <div style={{ height: '6px', backgroundColor: 'var(--color-sage)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${slot.progress}%`, backgroundColor: 'var(--color-emerald)', borderRadius: '3px', transition: 'width 0.2s ease' }} />
          </div>
        </div>
      )}

      {/* Uploaded file info */}
      {isDone && slot.doc && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileText size={16} style={{ color: 'var(--color-emerald)', flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-charcoal)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {slot.doc.fileName}
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 }}>
              {(slot.doc.fileSize / 1024).toFixed(0)} KB
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button type="button" onClick={() => inputRef.current?.click()}
              style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--color-forest)',
                background: 'none', border: 'none', cursor: 'pointer' }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
              onBlur={e  => (e.currentTarget.style.outline = 'none')}>
              Replace
            </button>
            <button type="button" onClick={onRemove} aria-label="Remove file"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px',
                borderRadius: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}
              onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
              onBlur={e  => (e.currentTarget.style.outline = 'none')}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {isErr && slot.error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <AlertCircle size={14} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--color-danger)', margin: 0 }}>{slot.error}</p>
        </div>
      )}
    </div>
  )
}

// ─── Step 5 ───────────────────────────────────────────────────────────────────
export default function Step5Documents() {
  const typeId       = useBookingStore(s => s.typeId)
  const docSlots     = useBookingStore(s => s.docSlots)
  const errors       = useBookingStore(s => s.stepErrors[4])
  const initDocSlots = useBookingStore(s => s.initDocSlots)
  const updateSlot   = useBookingStore(s => s.updateDocSlot)
  const removeSlot   = useBookingStore(s => s.removeDocSlot)
  const addOptional  = useBookingStore(s => s.addOptionalSlot)

  const { data: requiredTypes = [], isLoading } = useQuery({
    queryKey: ['booking-doc-types', typeId],
    queryFn:  () => fetchRequiredDocTypes(typeId),
    enabled:  !!typeId,
  })

  // Initialise slots from required doc types (only once, or when typeId changes)
  useEffect(() => {
    if (requiredTypes.length > 0 && docSlots.length === 0) {
      initDocSlots(requiredTypes.map(dt => ({
        docTypeId:    dt.id,
        uploadStatus: 'idle' as const,
        progress:     0,
      })))
    }
  }, [requiredTypes, docSlots.length, initDocSlots])

  const sessionMgr = (() => {
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSessionManager()
    } catch {
      return null
    }
  })()

  async function handleFile(docTypeId: string, file: File, maxSizeMb: number, acceptedFormats: string[]) {
    updateSlot(docTypeId, { uploadStatus: 'uploading', progress: 0, error: undefined })
    sessionMgr?.trackUpload(true)
    try {
      const doc = await uploadDocument(
        file,
        docTypeId,
        typeId,
        p => updateSlot(docTypeId, { progress: p.percent }),
      )
      updateSlot(docTypeId, { uploadStatus: 'done', progress: 100, doc })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Try again.'
      updateSlot(docTypeId, { uploadStatus: 'error', error: msg })
    } finally {
      sessionMgr?.trackUpload(false)
    }
  }


  if (isLoading) {
    return <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>Loading document requirements...</p>
  }

  const requiredMap = new Map(requiredTypes.map(dt => [dt.id, dt]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {requiredTypes.length === 0 && (
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Documents are optional for this appointment type.
        </p>
      )}

      {errors.documents && (
        <p role="alert" style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--color-danger)' }}>
          {errors.documents}
        </p>
      )}

      {/* Upload rows for required types */}
      {docSlots
        .filter(slot => requiredMap.has(slot.docTypeId))
        .map(slot => {
          const dt = requiredMap.get(slot.docTypeId)!
          return (
            <UploadRow
              key={slot.docTypeId}
              slot={slot}
              label={dt.label}
              required={dt.required}
              acceptedFormats={dt.acceptedFormats}
              maxSizeMb={dt.maxSizeMb}
              typeId={typeId}
              onFileChosen={file => handleFile(slot.docTypeId, file, dt.maxSizeMb, dt.acceptedFormats)}
              onRemove={() => updateSlot(slot.docTypeId, { uploadStatus: 'idle', doc: undefined, error: undefined, progress: 0 })}
            />
          )
        })}

      {/* Optional extra docs */}
      {docSlots
        .filter(slot => !requiredMap.has(slot.docTypeId))
        .map(slot => (
          <UploadRow
            key={slot.docTypeId}
            slot={slot}
            label="Additional document"
            required={false}
            acceptedFormats={['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']}
            maxSizeMb={10}
            typeId={typeId}
            onFileChosen={file => handleFile(slot.docTypeId, file, 10, [])}
            onRemove={() => removeSlot(slot.docTypeId)}
          />
        ))}

      {/* Add optional doc */}
      <button
        type="button"
        onClick={addOptional}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '14px',
          color: 'var(--color-forest)', background: 'none', border: '1.5px dashed var(--color-sage)',
          borderRadius: '8px', padding: '12px 16px', cursor: 'pointer', width: '100%',
          justifyContent: 'center',
        }}
        onFocus={e => (e.currentTarget.style.outline = '2px solid var(--color-emerald)')}
        onBlur={e  => (e.currentTarget.style.outline = 'none')}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-emerald)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-sage)')}
      >
        <Plus size={15} aria-hidden="true" />
        Add another document
      </button>
    </div>
  )
}
