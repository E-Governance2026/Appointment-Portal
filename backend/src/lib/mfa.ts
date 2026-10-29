// ─── Multi-Factor Authentication & Cryptographic At-Rest Encryption ──────────
// Implements:
// 1. AES-256-GCM symmetric encryption/decryption for secrets at rest (APP_ENCRYPTION_KEY).
// 2. RFC 6238 TOTP (30s period, SHA-1, 6 digits, 1-step drift window).
// 3. QR code data URL generation and manual base32 secret display.
// 4. Single-use recovery codes (10 generated, stored SHA-256 hashed).
// 5. Replay protection preventing reusing a code within the same step window.

import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'
import { env } from '../config/env.js'

// ── 1. AES-256-GCM Encryption ────────────────────────────────────────────────
// Key ring supporting key rotation: maps keyId -> 32-byte Buffer
function getKeyRing(): Map<string, Buffer> {
  const ring = new Map<string, Buffer>()
  const rawDefault = env.appEncryptionKey
  const defaultBuf = rawDefault.length === 64
    ? Buffer.from(rawDefault, 'hex')
    : Buffer.from(rawDefault.padEnd(32, '0').slice(0, 32), 'utf8')
  ring.set('v1', defaultBuf)

  if (env.appEncryptionKeyRotation) {
    const pairs = env.appEncryptionKeyRotation.split(',')
    for (const pair of pairs) {
      const [id, keyHex] = pair.split(':')
      if (id && keyHex) {
        ring.set(id.trim(), Buffer.from(keyHex.trim(), 'hex'))
      }
    }
  }
  return ring
}

/**
 * Encrypt plaintext string with AES-256-GCM.
 * Stores keyId with ciphertext: `${keyId}:${ivHex}:${authTagHex}:${encryptedHex}`.
 */
export function encryptAtRest(plaintext: string, keyId = 'v1'): string {
  const ring = getKeyRing()
  const key = ring.get(keyId)
  if (!key) {
    throw new Error(`Encryption key '${keyId}' not found in key ring.`)
  }
  const iv = randomBytes(12) // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${keyId}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt AES-256-GCM payload.
 * Supports both rotated format (keyId:iv:tag:cipher) and legacy format (iv:tag:cipher).
 */
export function decryptAtRest(encryptedPayload: string): string {
  const parts = encryptedPayload.split(':')
  let keyId = 'v1'
  let ivHex = ''
  let tagHex = ''
  let cipherHex = ''

  if (parts.length === 4) {
    [keyId, ivHex, tagHex, cipherHex] = parts
  } else if (parts.length === 3) {
    // Backwards compatibility with legacy unkeyed ciphertext
    [ivHex, tagHex, cipherHex] = parts
  } else {
    throw new Error('Malformed encrypted payload.')
  }

  const ring = getKeyRing()
  const key = ring.get(keyId)
  if (!key) {
    throw new Error(`Decryption failed: key ID '${keyId}' not found in active key ring.`)
  }

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// ── 2. TOTP Generation & Verification ─────────────────────────────────────────

export interface MfaSetupDetails {
  secretBase32: string
  otpauthUri:   string
  qrCodeDataUrl: string
}

/**
 * Generate a new TOTP secret for user enrollment.
 * Returns base32 key, standard otpauth:// URL, and a QR code Data URL.
 */
export async function generateTotpSetup(userEmail: string): Promise<MfaSetupDetails> {
  const secret = new OTPAuth.Secret({ size: 20 })
  const totp = new OTPAuth.TOTP({
    issuer: 'Parul University MIS',
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })

  const secretBase32 = secret.base32
  const otpauthUri = totp.toString()
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
  })

  return {
    secretBase32,
    otpauthUri,
    qrCodeDataUrl,
  }
}

/**
 * Validate a candidate 6-digit TOTP code against a secret.
 * Enforces drift window of 1 (±30s) and checks against replay of lastUsedStep.
 */
export function verifyTotpCode(
  secretBase32: string,
  candidateCode: string,
  lastUsedStep = -1,
): { valid: boolean; currentStep: number; reason?: string } {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'Parul University MIS',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    })

    const cleanCode = candidateCode.replace(/\s+/g, '').trim()
    const delta = totp.validate({ token: cleanCode, window: 1 })

    if (delta === null) {
      return { valid: false, currentStep: -1, reason: 'Invalid or expired code.' }
    }

    // Current time-step calculated with drift delta
    const currentStep = Math.floor(Date.now() / 1000 / 30) + delta
    if (currentStep <= lastUsedStep) {
      return { valid: false, currentStep, reason: 'Code has already been used. Please wait for the next code.' }
    }

    return { valid: true, currentStep }
  } catch {
    return { valid: false, currentStep: -1, reason: 'Verification failed.' }
  }
}

// ── 3. Single-Use Recovery Codes ──────────────────────────────────────────────

export interface GeneratedRecoveryCodes {
  plainCodes: string[]
  hashedCodes: string[]
}

/** Hash a recovery code with SHA-256. */
export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Generate 10 single-use recovery codes.
 * Format: 8 alphanumeric characters formatted as XXXX-XXXX.
 */
export function generateRecoveryCodes(count = 10): GeneratedRecoveryCodes {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const plainCodes: string[] = []
  const hashedCodes: string[] = []

  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8)
    let code = ''
    for (let j = 0; j < 8; j++) {
      code += chars[bytes[j] % chars.length]
    }
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`
    plainCodes.push(formatted)
    hashedCodes.push(hashRecoveryCode(formatted))
  }

  return { plainCodes, hashedCodes }
}

/**
 * Verify and consume a single-use recovery code.
 * If matched, returns { valid: true, remainingHashes: string[] }.
 */
export function consumeRecoveryCode(
  candidateCode: string,
  storedHashedCodes: string[],
): { valid: boolean; remainingHashes: string[] } {
  const candidateHash = hashRecoveryCode(candidateCode)
  const candidateBuf = Buffer.from(candidateHash, 'hex')

  const matchIndex = storedHashedCodes.findIndex(hash => {
    try {
      const storedBuf = Buffer.from(hash, 'hex')
      return storedBuf.length === candidateBuf.length && timingSafeEqual(storedBuf, candidateBuf)
    } catch {
      return false
    }
  })

  if (matchIndex === -1) {
    return { valid: false, remainingHashes: storedHashedCodes }
  }

  // Remove the consumed code
  const remainingHashes = [...storedHashedCodes]
  remainingHashes.splice(matchIndex, 1)
  return { valid: true, remainingHashes }
}
