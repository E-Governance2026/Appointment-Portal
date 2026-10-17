// ─── Table primitives ─────────────────────────────────────────────────────────
// Sticky header, faint cream row hover, 72px rows by default, sentence-case
// header text at 14px/600, and a numeric Cell variant (tabular figures,
// right-aligned). Compose these instead of hand-rolling <table> styles.

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode
}

export function Table({ children, style, ...rest }: TableProps) {
  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', ...style }}
        {...rest}
      >
        {children}
      </table>
    </div>
  )
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>
}

export function TH({ children, numeric, style }: { children?: React.ReactNode; numeric?: boolean; style?: React.CSSProperties }) {
  return (
    <th style={{
      position: 'sticky', top: 0, zIndex: 1,
      textAlign: numeric ? 'right' : 'left',
      padding: '12px 16px',
      fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
      color: 'var(--color-text-secondary)',
      backgroundColor: 'var(--color-ivory)',
      borderBottom: '1px solid var(--color-sage)',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </th>
  )
}

export function TRow({ children, onClick, selected }: { children: React.ReactNode; onClick?: () => void; selected?: boolean }) {
  const clickable = !!onClick
  return (
    <tr
      onClick={onClick}
      className="ui-trow"
      data-selected={selected ? 'true' : undefined}
      style={{ height: '72px', cursor: clickable ? 'pointer' : 'default' }}
    >
      {children}
      <style>{`
        .ui-trow { border-top: 1px solid var(--color-sage); transition: background-color var(--motion-fast) var(--ease-out); }
        .ui-trow:first-child { border-top: none; }
        .ui-trow:hover { background-color: var(--color-cream); }
        .ui-trow[data-selected="true"] { background-color: rgb(7 59 53 / 0.06); }
      `}</style>
    </tr>
  )
}

export function Cell({ children, numeric, style }: { children?: React.ReactNode; numeric?: boolean; style?: React.CSSProperties }) {
  return (
    <td
      className={numeric ? 'tnum' : undefined}
      style={{
        padding: '12px 16px', verticalAlign: 'middle',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
        color: 'var(--color-charcoal)',
        textAlign: numeric ? 'right' : 'left',
        ...style,
      }}
    >
      {children}
    </td>
  )
}
