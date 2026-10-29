import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { runSecretScan } from '../backend/src/scripts/scan-secrets.js'

// ─── Unified Security Scanner ────────────────────────────────────────────────
// Runs:
// 1. npm audit (Root + Backend)
// 2. Secret scanning (Gitleaks / scan-secrets.ts)
// 3. Production dependency license compliance check
// 4. OWASP ZAP Docker inspection and guideline reporting

const rootDir = process.cwd()

const ALLOWED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'Python-2.0',
  'CC0-1.0',
  'OFL-1.1',
  'Unlicense',
])

function checkLicenses(packageJsonPath: string, nodeModulesPath: string): { total: number; compliant: number; nonCompliant: Array<{ pkg: string; license: string }> } {
  if (!fs.existsSync(packageJsonPath)) {
    return { total: 0, compliant: 0, nonCompliant: [] }
  }

  const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const deps = Object.keys(pkgJson.dependencies || {})
  const nonCompliant: Array<{ pkg: string; license: string }> = []
  let compliant = 0

  for (const dep of deps) {
    let license = 'UNKNOWN'
    const depPkgJsonPath = path.join(nodeModulesPath, dep, 'package.json')
    if (fs.existsSync(depPkgJsonPath)) {
      try {
        const depPkg = JSON.parse(fs.readFileSync(depPkgJsonPath, 'utf8'))
        license = depPkg.license || (typeof depPkg.licenses === 'object' ? JSON.stringify(depPkg.licenses) : 'UNKNOWN')
      } catch {
        license = 'READ_ERROR'
      }
    }

    // Handle SPDX expressions or objects
    const cleanLic = typeof license === 'string' ? license.replace(/[()]/g, '').trim() : JSON.stringify(license)
    const isAllowed = Array.from(ALLOWED_LICENSES).some(allowed => cleanLic.includes(allowed))

    if (isAllowed) {
      compliant++
    } else {
      nonCompliant.push({ pkg: dep, license: cleanLic })
    }
  }

  return { total: deps.length, compliant, nonCompliant }
}

async function main() {
  console.log('=================================================================')
  console.log('       APPOINTMENT PORTAL — AUTOMATED SECURITY SCANNER           ')
  console.log('=================================================================\n')

  let allPassed = true

  // 1. NPM AUDIT (ROOT)
  console.log('[1/4] Running npm audit (Frontend / Root)...')
  try {
    const rootAudit = execSync('npm audit --audit-level=high', { cwd: rootDir, stdio: 'pipe' }).toString()
    console.log('  ✓ Root dependencies: 0 high/critical vulnerabilities.')
  } catch (err: any) {
    console.error('  ✗ Root dependencies audit failed!')
    if (err.stdout) console.error(err.stdout.toString())
    allPassed = false
  }

  // 1b. NPM AUDIT (BACKEND)
  console.log('[1b/4] Running npm audit (Backend)...')
  try {
    const backendAudit = execSync('npm audit --audit-level=high', { cwd: path.join(rootDir, 'backend'), stdio: 'pipe' }).toString()
    console.log('  ✓ Backend dependencies: 0 high/critical vulnerabilities.')
  } catch (err: any) {
    console.error('  ✗ Backend dependencies audit failed!')
    if (err.stdout) console.error(err.stdout.toString())
    allPassed = false
  }

  // 2. SECRET SCANNING
  console.log('\n[2/4] Scanning repository for leaked secrets and unignored .env files...')
  try {
    // Check if gitleaks CLI is present
    let gitleaksUsed = false
    try {
      execSync('gitleaks version', { stdio: 'ignore' })
      execSync('gitleaks detect --no-git -c .gitleaks.toml -v', { cwd: rootDir, stdio: 'inherit' })
      console.log('  ✓ Gitleaks CLI completed scan: 0 secrets detected.')
      gitleaksUsed = true
    } catch {
      // Gitleaks binary not in PATH, use built-in secret scan engine
    }

    if (!gitleaksUsed) {
      const secretResult = runSecretScan()
      if (secretResult.passed) {
        console.log('  ✓ Secret scan passed: 0 secrets or unignored .env files in git index.')
      } else {
        console.error(`  ✗ Secret scan detected ${secretResult.findings.length} findings:`)
        secretResult.findings.forEach(f => console.error(`    - ${f.file}:${f.line} -> ${f.rule}`))
        allPassed = false
      }
    }
  } catch (err) {
    console.error('  ✗ Secret scan encountered an error:', err)
    allPassed = false
  }

  // 3. DEPENDENCY LICENSE COMPLIANCE
  console.log('\n[3/4] Checking production dependency license compliance...')
  const rootLic = checkLicenses(path.join(rootDir, 'package.json'), path.join(rootDir, 'node_modules'))
  const backendLic = checkLicenses(path.join(rootDir, 'backend/package.json'), path.join(rootDir, 'backend/node_modules'))

  console.log(`  - Frontend: ${rootLic.compliant}/${rootLic.total} packages compliant (MIT, Apache, BSD, ISC).`)
  if (rootLic.nonCompliant.length > 0) {
    console.warn('    Non-compliant frontend packages:', rootLic.nonCompliant)
    allPassed = false
  }

  console.log(`  - Backend:  ${backendLic.compliant}/${backendLic.total} packages compliant (MIT, Apache, BSD, ISC).`)
  if (backendLic.nonCompliant.length > 0) {
    console.warn('    Non-compliant backend packages:', backendLic.nonCompliant)
    allPassed = false
  }

  if (rootLic.nonCompliant.length === 0 && backendLic.nonCompliant.length === 0) {
    console.log('  ✓ 100% of production dependencies use approved permissive licenses.')
  }

  // 4. OWASP ZAP DOCKER AVAILABILITY CHECK & GUIDANCE
  console.log('\n[4/4] Checking OWASP ZAP container availability...')
  let dockerRunning = false
  try {
    execSync('docker info', { stdio: 'ignore' })
    dockerRunning = true
  } catch {
    dockerRunning = false
  }

  if (dockerRunning) {
    console.log('  ✓ Docker daemon is active.')
    console.log('  To execute an OWASP ZAP baseline scan against a locally running dev instance:')
    console.log('  docker run -t --rm -v $(pwd):/zap/wrk/:rw zaproxy/zap-stable zap-baseline.py -t http://host.docker.internal:4000 -r zap_report.html')
  } else {
    console.log('  ℹ Docker daemon is not active or not installed on this host.')
    console.log('  [OWASP ZAP Run Instructions]:')
    console.log('  1. Start Docker Desktop.')
    console.log('  2. Start the application locally: npm run dev (backend on port 4000, frontend on port 5173).')
    console.log('  3. Run ZAP Baseline Scan against the local backend:')
    console.log('     docker run -t --rm -v $(pwd):/zap/wrk/:rw zaproxy/zap-stable zap-baseline.py -t http://host.docker.internal:4000 -r zap_report.html')
    console.log('  CRITICAL SAFETY WARNING: NEVER run OWASP ZAP or any automated vulnerability scanner against a production environment.')
  }

  console.log('\n=================================================================')
  if (allPassed) {
    console.log('✓ ALL SECURITY AUDITS AND COMPLIANCE CHECKS PASSED.')
    console.log('=================================================================\n')
    process.exit(0)
  } else {
    console.error('✗ ONE OR MORE SECURITY CHECKS FAILED!')
    console.log('=================================================================\n')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error running security scan:', err)
  process.exit(1)
})
