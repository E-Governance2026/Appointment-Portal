import { CalendarCheck } from 'lucide-react'

type LogoSize = 'sm' | 'md' | 'lg'
type LogoVariant = 'light' | 'dark'   // background the logo sits on

interface LogoProps {
  size?:     LogoSize
  variant?:  LogoVariant   // 'light' bg -> charcoal text; 'dark' bg -> white text
  showText?: boolean
}

const TILE: Record<LogoSize, number> = { sm: 32, md: 40, lg: 52 }
const ICON: Record<LogoSize, number> = { sm: 16, md: 20, lg: 26 }
const TITLE: Record<LogoSize, string> = { sm: 'var(--text-base)', md: 'var(--text-lg)', lg: 'var(--text-xl)' }
const SUB:   Record<LogoSize, string> = { sm: 'var(--text-xs)',   md: 'var(--text-xs)', lg: 'var(--text-sm)' }

// ─── Logo ─────────────────────────────────────────────────────────────────────
// The single logo implementation: a forest tile with a white calendar-check
// icon, the wordmark "Appointment Portal" (Source Serif 4) and "Parul
// University" below. Replaces every bespoke logo across the app.
export default function Logo({ size = 'md', variant = 'light', showText = true }: LogoProps) {
  const onDark = variant === 'dark'
  const titleColor = onDark ? '#ffffff' : 'var(--color-charcoal)'
  const subColor   = onDark ? 'rgb(255 255 255 / 0.85)' : 'var(--color-text-secondary)'
  const tilePx = TILE[size]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div
        aria-hidden="true"
        style={{
          width: tilePx, height: tilePx, flexShrink: 0,
          borderRadius: 'var(--radius-md)',
          backgroundColor: onDark ? 'var(--color-on-forest-12)' : 'var(--color-forest)',
          border: onDark ? '1px solid rgb(255 255 255 / 0.22)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <CalendarCheck size={ICON[size]} color="#ffffff" aria-hidden="true" />
      </div>

      {showText && (
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: TITLE[size],
            lineHeight: 1.25, color: titleColor, margin: 0, whiteSpace: 'nowrap' }}>
            Appointment Portal
          </p>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: SUB[size],
            lineHeight: 1.3, color: subColor, margin: 0, whiteSpace: 'nowrap' }}>
            Parul University
          </p>
        </div>
      )}
    </div>
  )
}
