import type { ReactNode, HTMLAttributes } from 'react'

/**
 * Container
 * Max-width 1200px, centred, with horizontal padding that keeps
 * content away from screen edges at all viewports:
 *   - mobile (< 768px):  24px each side
 *   - desktop (>= 768px): 40px each side
 */
interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export default function Container({ children, className = '', style, ...rest }: ContainerProps) {
  return (
    <div
      {...rest}
      className={className}
      style={{
        maxWidth: '1200px',
        marginLeft: 'auto',
        marginRight: 'auto',
        paddingLeft: 'clamp(1.5rem, 4vw, 2.5rem)',
        paddingRight: 'clamp(1.5rem, 4vw, 2.5rem)',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
