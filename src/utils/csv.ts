// ─── CSV utilities ────────────────────────────────────────────────────────────
// Dependency-free CSV generation. Used to export filtered report data.

/** Escape a single CSV cell per RFC 4180 (quote when needed, double inner quotes). */
export function csvCell(value: string | number): string {
  const s = String(value ?? '')
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Build a CSV string from a header row and data rows.
 * Rows are arrays of strings/numbers; columns must line up with the header.
 */
export function toCsv(header: (string | number)[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map(cols => cols.map(csvCell).join(','))
  return lines.join('\r\n')
}

/**
 * Trigger a browser download of the given text as a file.
 * No-op in a non-browser environment (guards for tests).
 */
export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
