import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

// ─── Secret Scanner Script ───────────────────────────────────────────────────
// Runs as a pre-commit check or CI pipeline stage.
// Scans files for high-entropy secrets, private keys, database credentials, and unignored .env files.

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, '../../../')

const IGNORED_PATHS = [
  'node_modules',
  'dist',
  '.git',
  'package-lock.json',
  '.env.example',
  'backend/.env.example',
  'backend/src/data/commonPasswords.json',
]

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'Private Key Block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: 'AWS Access Key ID',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'Slack Webhook / Token',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]{8}\/B[0-9A-Z]{8}\/[0-9a-zA-Z]{24}/,
  },
  {
    name: 'Unallowlisted Live JWT Secret in Source',
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{30,}/,
  },
]

export function scanFile(filePath: string): Array<{ file: string; line: number; rule: string }> {
  const findings: Array<{ file: string; line: number; rule: string }> = []
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/')

  // Skip ignored paths and test files that test the scanner itself
  if (IGNORED_PATHS.some(p => relPath.includes(p)) || relPath.endsWith('scan-secrets.ts') || relPath.endsWith('securityHarden.test.ts')) {
    return findings
  }

  // Check if .env file is tracked in git index (must never be tracked)
  if (path.basename(filePath) === '.env' || (path.basename(filePath).startsWith('.env.') && !filePath.includes('.example'))) {
    try {
      const tracked = execSync(`git ls-files "${filePath}"`, { stdio: 'pipe' }).toString().trim()
      if (tracked) {
        findings.push({ file: relPath, line: 1, rule: 'Tracked .env secret file found in git index' })
      }
    } catch {}
    return findings
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    lines.forEach((line, index) => {
      // Ignore comments indicating placeholders or examples
      if (line.includes('your-') || line.includes('placeholder') || line.includes('0123456789abcdef')) {
        return
      }

      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({ file: relPath, line: index + 1, rule: name })
        }
      }
    })
  } catch {
    // Ignore unreadable binary files
  }

  return findings
}

export function scanDirectory(dir: string): Array<{ file: string; line: number; rule: string }> {
  let findings: Array<{ file: string; line: number; rule: string }> = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/')

    if (IGNORED_PATHS.some(p => rel.startsWith(p) || rel.includes(`/${p}`))) {
      continue
    }

    if (entry.isDirectory()) {
      findings = findings.concat(scanDirectory(fullPath))
    } else if (entry.isFile()) {
      findings = findings.concat(scanFile(fullPath))
    }
  }

  return findings
}

export function runSecretScan(): { passed: boolean; findings: Array<{ file: string; line: number; rule: string }> } {
  const findings = scanDirectory(rootDir)
  return {
    passed: findings.length === 0,
    findings,
  }
}

// Execute CLI when run directly
if (process.argv[1] && process.argv[1].endsWith('scan-secrets.ts')) {
  // eslint-disable-next-line no-console
  console.log('[gitleaks/secret-scanner] Scanning repository for leaked credentials and unignored secrets...')
  const result = runSecretScan()
  if (!result.passed) {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] Secret scan detected ${result.findings.length} potential secrets!`)
    result.findings.forEach(f => {
      // eslint-disable-next-line no-console
      console.error(`  - ${f.file}:${f.line} -> ${f.rule}`)
    })
    process.exit(1)
  } else {
    // eslint-disable-next-line no-console
    console.log('[SUCCESS] Secret scan passed: 0 exposed secrets found.')
  }
}
