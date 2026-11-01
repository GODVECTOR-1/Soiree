import type { BudgetLine } from '@/lib/schemas'

/** Budget split as a ribbon. Priorities get the accent AND a star, so color is never the only signal. */
export function Ribbon({ lines }: { lines: BudgetLine[] }) {
  const total = lines.reduce((s, l) => s + l.amount, 0) || 1
  const label = lines
    .map((l) => `${l.category} ${Math.round(l.sharePct)} percent${l.isPriority ? ', priority' : ''}`)
    .join(', ')
  return (
    <div className="ribbon-wrap" role="img" aria-label={`Budget split: ${label}`}>
      <div className="ribbon">
        {lines.map((l) => (
          <div
            key={l.id}
            className={l.isPriority ? 'ribbon-segment priority' : 'ribbon-segment'}
            style={{ width: `${(l.amount / total) * 100}%` }}
          >
            {l.isPriority && <span className="star">★</span>}
          </div>
        ))}
      </div>
      <div className="ribbon-labels" aria-hidden="true">
        {lines.map((l) => (
          <div key={l.id} style={{ width: `${(l.amount / total) * 100}%` }}>
            <strong>{l.category}</strong>
            <span>{Math.round(l.sharePct)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
