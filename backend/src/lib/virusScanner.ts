import net from 'node:net'
import { isProduction } from '../config/env.js'

// ─── Virus Scanner Interface & ClamAV Protocol ───────────────────────────────
// Provides ClamAV TCP stream scanner (clamd over TCP) and development NoOpScanner.
// In production, when CLAMAV_ENABLED is false, logs a prominent startup warning.

export interface VirusScanResult {
  clean: boolean
  virusName?: string
  error?: string
}

export interface VirusScanner {
  scanBuffer(buffer: Buffer): Promise<VirusScanResult>
  scanStream(stream: NodeJS.ReadableStream): Promise<VirusScanResult>
}

// Standard EICAR signature for testing antivirus pipelines without real malware
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

export class ClamAvScanner implements VirusScanner {
  private host: string
  private port: number
  private timeoutMs: number

  constructor(host = process.env.CLAMAV_HOST || '127.0.0.1', port = Number(process.env.CLAMAV_PORT || 3310), timeoutMs = 15000) {
    this.host = host
    this.port = port
    this.timeoutMs = timeoutMs
  }

  async scanBuffer(buffer: Buffer): Promise<VirusScanResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      let response = ''
      let resolved = false

      const cleanup = () => {
        if (!socket.destroyed) {
          socket.destroy()
        }
      }

      socket.setTimeout(this.timeoutMs, () => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({ clean: false, error: `ClamAV scan timed out after ${this.timeoutMs}ms.` })
        }
      })

      socket.connect(this.port, this.host, () => {
        // Send zINSTREAM command with null delimiter
        socket.write('zINSTREAM\0')

        // Stream chunks: [4-byte big-endian length][chunk bytes]
        const chunkSize = 64 * 1024
        for (let i = 0; i < buffer.length; i += chunkSize) {
          const chunk = buffer.subarray(i, Math.min(i + chunkSize, buffer.length))
          const lenBuf = Buffer.alloc(4)
          lenBuf.writeUInt32BE(chunk.length, 0)
          socket.write(lenBuf)
          socket.write(chunk)
        }

        // Terminator: 4-byte 0 length
        const termBuf = Buffer.alloc(4)
        termBuf.writeUInt32BE(0, 0)
        socket.write(termBuf)
      })

      socket.on('data', (data) => {
        response += data.toString('utf8')
      })

      socket.on('end', () => {
        if (!resolved) {
          resolved = true
          const res = response.trim()
          if (res.includes('OK')) {
            resolve({ clean: true })
          } else if (res.includes('FOUND')) {
            const match = res.match(/stream:\s*(.+)\s+FOUND/)
            resolve({ clean: false, virusName: match ? match[1] : 'Malware.Detected' })
          } else {
            resolve({ clean: false, error: `ClamAV daemon error: ${res}` })
          }
        }
      })

      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true
          cleanup()
          // Block if scanning fails
          resolve({ clean: false, error: `ClamAV connection error: ${err.message}` })
        }
      })
    })
  }

  async scanStream(stream: NodeJS.ReadableStream): Promise<VirusScanResult> {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return this.scanBuffer(Buffer.concat(chunks))
  }
}

export class NoOpScanner implements VirusScanner {
  async scanBuffer(buffer: Buffer): Promise<VirusScanResult> {
    const content = buffer.toString('utf8', 0, Math.min(buffer.length, 4096))
    if (content.includes(EICAR_SIGNATURE) || buffer.includes(Buffer.from(EICAR_SIGNATURE))) {
      return { clean: false, virusName: 'Eicar-Test-Signature' }
    }
    return { clean: true }
  }

  async scanStream(stream: NodeJS.ReadableStream): Promise<VirusScanResult> {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return this.scanBuffer(Buffer.concat(chunks))
  }
}

let activeScanner: VirusScanner | null = null

export function getVirusScanner(): VirusScanner {
  if (activeScanner) return activeScanner

  const clamAvEnabled = process.env.CLAMAV_ENABLED === 'true'
  if (clamAvEnabled) {
    activeScanner = new ClamAvScanner()
  } else {
    activeScanner = new NoOpScanner()
  }
  return activeScanner
}

export function setVirusScannerForTesting(scanner: VirusScanner | null): void {
  activeScanner = scanner
}

/**
 * Startup sanity check: outputs a prominent security warning in production
 * if ClamAV is disabled.
 */
export function checkVirusScannerStartup(): void {
  const isP = isProduction()
  const clamAvEnabled = process.env.CLAMAV_ENABLED === 'true'
  if (isP && !clamAvEnabled) {
    // eslint-disable-next-line no-console
    console.warn('\x1b[33m%s\x1b[0m', '═══════════════════════════════════════════════════════════════════════════════════')
    // eslint-disable-next-line no-console
    console.warn('\x1b[33m%s\x1b[0m', ' [SECURITY WARNING] CLAMAV_ENABLED is not true in production!')
    // eslint-disable-next-line no-console
    console.warn('\x1b[33m%s\x1b[0m', ' Uploaded documents will NOT be scanned by ClamAV daemon.')
    // eslint-disable-next-line no-console
    console.warn('\x1b[33m%s\x1b[0m', ' To enable: set CLAMAV_ENABLED=true and ensure clamd is reachable over TCP.')
    // eslint-disable-next-line no-console
    console.warn('\x1b[33m%s\x1b[0m', '═══════════════════════════════════════════════════════════════════════════════════')
  }
}
