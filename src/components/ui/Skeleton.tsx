interface SkeletonProps {
  width?:  string | number
  height?: string | number
  radius?: string
  style?:  React.CSSProperties
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// Flat sage block with an opacity pulse. Static under prefers-reduced-motion
// (the global media query freezes the animation).
export default function Skeleton({ width = '100%', height = 16, radius = 'var(--radius-sm)', style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className="ui-skeleton"
      style={{
        display: 'block', width, height, borderRadius: radius,
        backgroundColor: 'var(--color-sage)', ...style,
      }}
    >
      <style>{`
        .ui-skeleton { animation: ui-skel-pulse 1.4s ease-in-out infinite; }
        @keyframes ui-skel-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
      `}</style>
    </span>
  )
}
