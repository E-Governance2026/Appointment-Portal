interface AvatarProps {
  name:  string
  size?: number   // pixel diameter
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
// Initials on a sage circle with charcoal text. One implementation for the
// sidebar, header, profile card, tables and lists.
export default function Avatar({ name, size = 36 }: AvatarProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: '50%',
        backgroundColor: 'var(--color-sage)',
        color: 'var(--color-charcoal)',
        fontFamily: 'var(--font-sans)',
        fontSize: Math.max(11, Math.round(size * 0.34)),
        fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {initialsOf(name)}
    </div>
  )
}
