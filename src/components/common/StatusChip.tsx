import {
  Clock,
  CircleHelp,
  CheckCircle,
  Calendar,
  XCircle,
  MinusCircle,
  AlertCircle,
} from 'lucide-react'
import { STATUS_CONFIG, type AppointmentStatus } from '../../data/mockAppointments'

// ─── Icon map — keyed to the icon string in STATUS_CONFIG ────────────────────
const ICON_MAP: Record<string, React.ReactNode> = {
  'clock':        <Clock        size={14} aria-hidden="true" />,
  'circle-help':  <CircleHelp   size={14} aria-hidden="true" />,
  'check-circle': <CheckCircle  size={14} aria-hidden="true" />,
  'calendar':     <Calendar     size={14} aria-hidden="true" />,
  'x-circle':     <XCircle      size={14} aria-hidden="true" />,
  'minus-circle': <MinusCircle  size={14} aria-hidden="true" />,
  'alert-circle': <AlertCircle  size={14} aria-hidden="true" />,
}

interface StatusChipProps {
  status: AppointmentStatus
  /** 'sm' = 12px text (default), 'md' = 13px */
  size?: 'sm' | 'md'
  /** Allow the label to wrap onto two lines in narrow cells (default: nowrap). */
  wrap?: boolean
}

/**
 * StatusChip
 * Single source-of-truth chip used across the dashboard table, agenda,
 * My Appointments, Approvals, and any other screen.
 *
 * Colors from STATUS_CONFIG in mockAppointments.ts.
 * 6px border-radius. No pill shape. Sentence case.
 * Chip text may wrap onto two lines (no white-space: nowrap).
 * Max-width 100% so it never overflows its column.
 * Line-height 18px so two-line chips stay readable.
 */
export default function StatusChip({ status, size = 'sm', wrap = false }: StatusChipProps) {
  const cfg      = STATUS_CONFIG[status]
  const icon     = ICON_MAP[cfg.icon] ?? null
  const fontSize = size === 'md' ? '13px' : '12px'

  return (
    <span
      style={{
        display:         'inline-flex',
        alignItems:      'flex-start',
        gap:             '4px',
        backgroundColor: cfg.bg,
        color:           cfg.color,
        fontSize,
        fontWeight:      600,
        fontFamily:      'var(--font-sans)',
        lineHeight:      '18px',
        padding:         '2px 8px',
        borderRadius:    '6px',
        maxWidth:        '100%',
        /* Default: single line (never clipped). wrap allows two lines in narrow cells. */
        whiteSpace:      wrap ? 'normal' : 'nowrap',
        wordBreak:       'normal',
        overflowWrap:    'normal',
      }}
    >
      {/* Icon sits on the first line baseline */}
      {icon && (
        <span
          style={{
            display:    'flex',
            alignItems: 'center',
            flexShrink: 0,
            marginTop:  '3px',   /* optical alignment with 18px line-height */
          }}
        >
          {icon}
        </span>
      )}
      {cfg.label}
    </span>
  )
}
