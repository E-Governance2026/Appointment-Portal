// ─── Input Sanitization, Injection Defense & URL Validation ──────────────────
// Provides central sanitization for:
// - Control character stripping from free-text inputs
// - Email & Employee ID normalization
// - SQL / PostgREST filter and LIKE pattern escaping
// - CSV formula injection prevention (=, +, -, @)
// - Safe URL validation for video conference and calendar links

const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g

/**
 * Strips ASCII control characters from free-text user inputs to prevent
 * header injection, log spoofing, and terminal escape sequence injection.
 */
export function stripControlCharacters(val: unknown): string {
  if (typeof val !== 'string') return ''
  return val.replace(CONTROL_CHARS_REGEX, '')
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

/**
 * Normalize and validate email addresses: strips whitespace, converts to lowercase,
 * and validates standard RFC format.
 */
export function normalizeEmail(email: string): string {
  const clean = stripControlCharacters(email).trim().toLowerCase()
  if (!clean || !EMAIL_REGEX.test(clean) || clean.length > 254) {
    throw new Error('Invalid email address format.')
  }
  return clean
}

const EMPLOYEE_ID_REGEX = /^[A-Z0-9_-]{3,32}$/

/**
 * Normalize and validate employee IDs: strips whitespace and converts to uppercase.
 */
export function normalizeEmployeeId(id: string): string {
  const clean = stripControlCharacters(id).trim().toUpperCase()
  if (!clean || !EMPLOYEE_ID_REGEX.test(clean)) {
    throw new Error('Invalid employee ID format. Must be 3-32 alphanumeric characters, dashes, or underscores.')
  }
  return clean
}

/**
 * Escape LIKE / ILIKE wildcard characters (%, _, \) to prevent wildcard injection DoS.
 */
export function sanitizeLikePattern(pattern: string): string {
  if (!pattern) return ''
  return pattern
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

/**
 * Escape PostgREST filter string delimiters (commas, parentheses, colons, quotes)
 * to prevent breaking out of .or(...) filter expressions.
 */
export function sanitizePostgrestFilter(val: string): string {
  if (!val) return ''
  return val.replace(/[,():"]/g, '')
}

/**
 * Sanitize CSV cell values to prevent CSV formula injection / DDE attacks.
 * Prepends a single quote to any cell starting with =, +, -, @, \t, or \r.
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return ''
  let str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export const ALLOWED_LINK_HOSTS = new Set([
  'meet.google.com',
  'calendar.google.com',
  'teams.microsoft.com',
  'zoom.us',
  'paruluniversity.ac.in',
  'university.edu',
])

/**
 * Validate that a URL is safe for rendering in hyperlinks:
 * - Protocol must strictly be https:
 * - Host must belong to allowed meeting or university domains
 * - No javascript:, data:, file:, vbscript: schemes
 */
export function isSafeUrl(url: string, allowedHosts: Set<string> = ALLOWED_LINK_HOSTS): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (/^(?:javascript|data|vbscript|file):/i.test(trimmed)) {
    return false
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    return allowedHosts.has(hostname) || Array.from(allowedHosts).some(h => hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Returns the URL if safe, or a fallback URL / empty string.
 */
export function safeUrl(url: string, fallback = ''): string {
  return isSafeUrl(url) ? url.trim() : fallback
}
