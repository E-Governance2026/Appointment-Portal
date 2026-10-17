import type { ReactNode, HTMLAttributes } from 'react'

/**
 * Section
 * Vertical padding: 64px on mobile, 96px on desktop (>= 768px).
 * Wraps a semantic <section> element.
 * Compose with Container inside when horizontal constraints are needed.
 */
interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  as?: 'section' | 'div' | 'article' | 'aside'
}

export default function Section({
  children,
  as: Tag = 'section',
  className = '',
  style,
  ...rest
}: SectionProps) {
  return (
    <Tag
      {...rest}
      className={className}
      style={{
        paddingTop: 'clamp(4rem, 8vw, 6rem)',
        paddingBottom: 'clamp(4rem, 8vw, 6rem)',
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}
