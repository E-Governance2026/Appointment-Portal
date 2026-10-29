import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import busboy from 'busboy'
import type { Request } from 'express'
import { HttpError } from './httpError.js'
import { stripControlCharacters } from './sanitizer.js'
import { getVirusScanner } from './virusScanner.js'
import type { Actor } from '../types.js'

// ─── Storage Directory Configuration ──────────────────────────────────────────
// Stored outside any public or web-accessible folder.
const here = path.dirname(fileURLToPath(import.meta.url))
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(here, '../../storage/uploads')

// Ensure directory exists with restrictive permissions
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 })
}

// ─── Limits ───────────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10)
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
export const MAX_FILES_PER_APPOINTMENT = 5
export const MAX_USER_STORAGE_BYTES = 50 * 1024 * 1024 // 50 MB total per user

// ─── Allowlist & Signatures ───────────────────────────────────────────────────
export type AllowedExtension = 'pdf' | 'docx' | 'jpg' | 'jpeg' | 'png'

export interface FileTypeDefinition {
  mime: string
  extensions: string[]
  validateMagic: (header: Buffer) => boolean
}

const FILE_TYPES: Record<string, FileTypeDefinition> = {
  pdf: {
    mime: 'application/pdf',
    extensions: ['.pdf'],
    validateMagic: (buf: Buffer) => buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-',
  },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
    // DOCX is a zip archive starting with PK\x03\x04
    validateMagic: (buf: Buffer) =>
      buf.length >= 4 &&
      buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04,
  },
  jpg: {
    mime: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    validateMagic: (buf: Buffer) =>
      buf.length >= 3 &&
      buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  png: {
    mime: 'image/png',
    extensions: ['.png'],
    validateMagic: (buf: Buffer) =>
      buf.length >= 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a,
  },
}

// Blocklist for dangerous executable / script signatures
function isDangerousExecutable(buf: Buffer): boolean {
  if (buf.length < 2) return false
  // DOS / Windows PE header (MZ)
  if (buf[0] === 0x4d && buf[1] === 0x5a) return true
  // Linux ELF binary
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true
  // Shell script / shebang (#! /)
  if (buf[0] === 0x23 && buf[1] === 0x21) return true
  // Java class file / Mach-O FAT
  if (buf.length >= 4 && buf[0] === 0xca && buf[1] === 0xfe && buf[2] === 0xba && buf[3] === 0xbe) return true
  // Web Script / HTML / SVG tags in first 100 bytes
  const textSample = buf.subarray(0, Math.min(buf.length, 256)).toString('utf8').toLowerCase()
  if (/<svg[\s>]/i.test(textSample)) return true
  if (/<html[\s>]/i.test(textSample) || /<!doctype html/i.test(textSample) || /<script[\s>]/i.test(textSample)) return true
  return false
}

/**
 * Sanitize client filename for metadata and Content-Disposition header.
 * Strips directory traversal paths, control chars, and non-printable characters.
 */
export function sanitizeClientFilename(rawName: string): string {
  const clean = stripControlCharacters(rawName).trim()
  const base = path.basename(clean)
  // Keep only alphanumeric, hyphens, underscores, spaces, single dot
  return base.replace(/[^a-zA-Z0-9.\-_\s]/g, '_').trim() || 'document.pdf'
}

/**
 * Validates filename:
 * - Reject double extensions (e.g. doc.pdf.exe, file.exe.pdf, test.docx.sh)
 * - Must strictly match single extension from allowlist
 */
export function validateFilenameStructure(filename: string): { ext: string; sanitizedName: string } {
  const sanitized = sanitizeClientFilename(filename)

  // Check for double extension patterns
  const dots = sanitized.split('.')
  if (dots.length > 2) {
    throw new HttpError('bad_request', 'Invalid file name. Double extensions are strictly prohibited.')
  }
  if (dots.length < 2) {
    throw new HttpError('bad_request', 'File name must include a valid file extension.')
  }

  const rawExt = `.${dots[1].toLowerCase()}`
  if (!['.pdf', '.docx', '.jpg', '.jpeg', '.png'].includes(rawExt)) {
    throw new HttpError('bad_request', 'File type not permitted. Only PDF, DOCX, JPG, and PNG are allowed.')
  }

  // Reject blocked extensions explicitly
  const dangerousPatterns = /\.(exe|bat|cmd|sh|php|phtml|js|vbs|msi|ps1|com|pif|scr|dll|jar|svg|html|htm)$/i
  if (dangerousPatterns.test(sanitized)) {
    throw new HttpError('bad_request', 'Executable and script file uploads are prohibited.')
  }

  return { ext: dots[1].toLowerCase(), sanitizedName: sanitized }
}

// ─── Uploaded Document Record ────────────────────────────────────────────────
export interface UploadedDocument {
  id: string
  appointmentId: string
  uploaderId: string
  originalName: string
  sanitizedName: string
  mimeType: string
  fileSize: number
  storagePath: string
  status: 'pending' | 'clean' | 'blocked'
  virusScanResult?: string
  createdAt: string
}

// In-memory registry for uploaded documents
const DOCUMENT_STORE = new Map<string, UploadedDocument>()

export function getDocumentRecord(id: string): UploadedDocument | undefined {
  return DOCUMENT_STORE.get(id)
}

export function listDocumentsForAppointment(appointmentId: string): UploadedDocument[] {
  return Array.from(DOCUMENT_STORE.values()).filter(d => d.appointmentId === appointmentId)
}

export function getUserTotalStorage(userId: string): number {
  return Array.from(DOCUMENT_STORE.values())
    .filter(d => d.uploaderId === userId && d.status !== 'blocked')
    .reduce((sum, d) => sum + d.fileSize, 0)
}

export function recordDocument(doc: UploadedDocument): void {
  DOCUMENT_STORE.set(doc.id, doc)
}

export function deleteDocumentRecord(id: string): void {
  const doc = DOCUMENT_STORE.get(id)
  if (doc) {
    try {
      if (fs.existsSync(doc.storagePath)) {
        fs.unlinkSync(doc.storagePath)
      }
    } catch {}
    DOCUMENT_STORE.delete(id)
  }
}

// ─── Streaming Multipart Upload Handler ──────────────────────────────────────
export interface StreamUploadResult {
  document: UploadedDocument
}

/**
 * Handles multipart file upload stream with:
 * - Real-time byte counting (aborts during stream if limit exceeded)
 * - Immediate magic bytes inspection on first chunk
 * - Server-generated random UUID storage path outside public dirs
 * - Antivirus scanning hook before confirming document
 */
export async function handleStreamingUpload(
  req: Request,
  appointmentId: string,
  actor: Actor,
): Promise<UploadedDocument> {
  // Quota check 1: Max files per appointment
  const existingApptDocs = listDocumentsForAppointment(appointmentId)
  if (existingApptDocs.length >= MAX_FILE_SIZE_MB) {
    // Check max files per appointment
    if (existingApptDocs.length >= MAX_FILES_PER_APPOINTMENT) {
      throw new HttpError('bad_request', `Maximum limit of ${MAX_FILES_PER_APPOINTMENT} files per appointment reached.`)
    }
  }

  // Quota check 2: User storage quota
  const currentUserStorage = getUserTotalStorage(actor.id)
  if (currentUserStorage >= MAX_USER_STORAGE_BYTES) {
    throw new HttpError('bad_request', 'User storage quota exceeded (50 MB limit).')
  }

  return new Promise((resolve, reject) => {
    let bb: busboy.Busboy
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: MAX_FILE_SIZE_BYTES,
        },
      })
    } catch (err) {
      return reject(new HttpError('bad_request', 'Invalid multipart request.'))
    }

    let fileProcessed = false
    const tempFileId = crypto.randomUUID()
    let tempFilePath = ''
    let writeStream: fs.WriteStream | null = null
    let totalBytes = 0
    let firstChunk: Buffer | null = null
    let hasError = false

    const cleanup = () => {
      hasError = true
      if (writeStream && !writeStream.destroyed) {
        writeStream.destroy()
      }
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath) } catch {}
      }
    }

    bb.on('file', (_fieldname, fileStream, fileInfo) => {
      const { filename } = fileInfo
      if (fileProcessed) {
        fileStream.resume()
        return
      }
      fileProcessed = true

      try {
        if (!filename) {
          cleanup()
          return reject(new HttpError('bad_request', 'Missing filename in upload.'))
        }

        const { ext, sanitizedName } = validateFilenameStructure(filename)
        const typeDef = FILE_TYPES[ext === 'jpeg' ? 'jpg' : ext]
        if (!typeDef) {
          cleanup()
          return reject(new HttpError('bad_request', 'Unsupported file extension.'))
        }

        const safeStorageFilename = `${tempFileId}.${ext}`
        tempFilePath = path.join(UPLOAD_DIR, safeStorageFilename)
        writeStream = fs.createWriteStream(tempFilePath, { mode: 0o600 })

        fileStream.on('data', (data: Buffer) => {
          if (hasError) return
          totalBytes += data.length

          // Size limit check enforced during the stream
          if (totalBytes > MAX_FILE_SIZE_BYTES) {
            cleanup()
            return reject(new HttpError('bad_request', `File size exceeds the maximum limit of ${MAX_FILE_SIZE_MB} MB.`))
          }

          if (currentUserStorage + totalBytes > MAX_USER_STORAGE_BYTES) {
            cleanup()
            return reject(new HttpError('bad_request', 'Uploading this file exceeds your 50 MB total storage quota.'))
          }

          // Inspect magic bytes on the very first chunk
          if (!firstChunk) {
            firstChunk = data
            // 1. Executable / script blocklist check
            if (isDangerousExecutable(firstChunk)) {
              cleanup()
              return reject(new HttpError('bad_request', 'File contains forbidden executable or script content.'))
            }

            // 2. Magic byte match for the claimed extension
            if (!typeDef.validateMagic(firstChunk)) {
              cleanup()
              return reject(new HttpError('bad_request', `File content (magic bytes) does not match the extension .${ext}.`))
            }
          }

          writeStream!.write(data)
        })

        fileStream.on('limit', () => {
          cleanup()
          reject(new HttpError('bad_request', `File size exceeds the maximum limit of ${MAX_FILE_SIZE_MB} MB.`))
        })

        fileStream.on('error', (err) => {
          cleanup()
          reject(new HttpError('internal_error', `File upload stream error: ${err.message}`))
        })

        fileStream.on('end', () => {
          if (hasError) return
          if (writeStream) {
            writeStream.end()
          }
        })

        writeStream.on('finish', async () => {
          if (hasError) return

          // Create document record in "pending" status until virus scanned
          const doc: UploadedDocument = {
            id: tempFileId,
            appointmentId,
            uploaderId: actor.id,
            originalName: filename,
            sanitizedName,
            mimeType: typeDef.mime,
            fileSize: totalBytes,
            storagePath: tempFilePath,
            status: 'pending',
            createdAt: new Date().toISOString(),
          }

          // Perform virus scanning
          try {
            const scanner = getVirusScanner()
            const fileBuf = fs.readFileSync(tempFilePath)
            const scanResult = await scanner.scanBuffer(fileBuf)

            if (!scanResult.clean) {
              doc.status = 'blocked'
              doc.virusScanResult = scanResult.virusName || scanResult.error || 'Malware detected'
              recordDocument(doc)
              // Securely delete blocked malware file
              try { fs.unlinkSync(tempFilePath) } catch {}
              return reject(new HttpError('bad_request', `Upload rejected: file failed virus scanning (${doc.virusScanResult}).`))
            }

            // File passed virus scan
            doc.status = 'clean'
            recordDocument(doc)
            resolve(doc)
          } catch (scanErr: any) {
            cleanup()
            return reject(new HttpError('internal_error', `Virus scan failed: ${scanErr.message}`))
          }
        })

        writeStream.on('error', (err) => {
          cleanup()
          reject(new HttpError('internal_error', `Storage write error: ${err.message}`))
        })
      } catch (validationErr) {
        cleanup()
        reject(validationErr)
      }
    })

    bb.on('error', (err: any) => {
      cleanup()
      reject(new HttpError('bad_request', `Multipart parsing error: ${err?.message || 'unknown'}`))
    })

    bb.on('finish', () => {
      if (!fileProcessed && !hasError) {
        reject(new HttpError('bad_request', 'No file uploaded in the request.'))
      }
    })

    req.pipe(bb)
  })
}

// ─── Scheduled Orphan Cleanup Job ─────────────────────────────────────────────
/**
 * Deletes files in UPLOAD_DIR that:
 * - Are older than 24 hours and not associated with any active clean appointment
 * - Or belong to a blocked/pending upload that timed out
 */
export function cleanupOrphanFiles(maxAgeMs = 24 * 60 * 60 * 1000): { deleted: number; errors: number } {
  let deleted = 0
  let errors = 0

  if (!fs.existsSync(UPLOAD_DIR)) {
    return { deleted: 0, errors: 0 }
  }

  const registeredPaths = new Set(
    Array.from(DOCUMENT_STORE.values())
      .filter(d => d.status === 'clean')
      .map(d => path.resolve(d.storagePath)),
  )

  const files = fs.readdirSync(UPLOAD_DIR)
  const now = Date.now()

  for (const file of files) {
    const fullPath = path.resolve(UPLOAD_DIR, file)
    try {
      const stat = fs.statSync(fullPath)
      const age = now - stat.mtimeMs
      if (age > maxAgeMs && !registeredPaths.has(fullPath)) {
        fs.unlinkSync(fullPath)
        deleted++
      }
    } catch {
      errors++
    }
  }

  return { deleted, errors }
}
