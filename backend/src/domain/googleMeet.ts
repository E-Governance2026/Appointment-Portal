// ─── Google Meet Utility (Backend) ───────────────────────────────────────────
// Deterministic standard-format Google Meet links for online appointments.

export function generateGoogleMeetLink(appointmentId: string): string {
  if (!appointmentId) return 'https://meet.google.com/apu-meet-live'

  const clean = appointmentId.toLowerCase().replace(/[^a-z0-9]/g, '')
  let h = 0
  for (let i = 0; i < clean.length; i++) {
    h = (Math.imul(31, h) + clean.charCodeAt(i)) | 0
  }
  const abs = Math.abs(h)

  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const p1 = 'apu'

  let p2 = ''
  let seed2 = (abs >>> 3) + 4321
  for (let i = 0; i < 4; i++) {
    p2 += letters[seed2 % 26]
    seed2 = Math.floor(seed2 / 26) + (i + 1) * 7
  }

  let p3 = ''
  let seed3 = (abs >>> 7) + 8765
  for (let i = 0; i < 3; i++) {
    p3 += letters[seed3 % 26]
    seed3 = Math.floor(seed3 / 26) + (i + 1) * 11
  }

  return `https://meet.google.com/${p1}-${p2}-${p3}`
}
