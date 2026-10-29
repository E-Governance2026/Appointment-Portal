// ─── Frontend Safe URL Validation ───────────────────────────────────────────
// Validates URLs before rendering into <a href> to prevent XSS / open redirects.

export const ALLOWED_MEETING_HOSTS = new Set([
  'meet.google.com',
  'calendar.google.com',
  'teams.microsoft.com',
  'zoom.us',
  'paruluniversity.ac.in',
  'university.edu',
])

export function isSafeUrl(url: unknown, allowedHosts: Set<string> = ALLOWED_MEETING_HOSTS): boolean {
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

export function safeHref(url: unknown, fallback = '#'): string {
  if (typeof url === 'string' && url.startsWith('#')) return url
  return isSafeUrl(url) ? (url as string).trim() : fallback
}
