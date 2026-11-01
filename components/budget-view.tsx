'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Ribbon } from '@/components/ribbon'
import { Heading, type ViewProps } from '@/components/plan-views'
import type { BudgetLine, Currency } from '@/lib/schemas'
import { totalCheck } from '@/lib/domain/allocate'
import { money } from '@/lib/format'

/** Amounts being edited, by line id, as typed (digits only). Null when not editing. */
type Drafts = Record<string, string> | null

const draftTotal = (lines: BudgetLine[], drafts: Drafts, target: number) =>
  totalCheck(
    lines.map((l) => ({ ...l, amount: Math.round(Number(drafts?.[l.id] ?? l.amount)) || 0 })),
    target,
  )

type RowProps = {
  line: BudgetLine
  currency: Currency
  draft: string | undefined
  editing: boolean
  onDraft: (value: string) => void
}

/** One budget line: its reason and trade-off, and its amount (an input while editing). */
function BudgetLineRow({ line: l, currency, draft, editing, onDraft }: RowProps) {
  return (
    <div className="line-row">
      <div>
        <strong>{l.category}</strong>
        {l.isPriority && <span className="priority-label">★ Priority</span>}
        <p>{l.rationale}</p>
        {l.tradeoffNote && <p className="tradeoff">{l.tradeoffNote}</p>}
      </div>
      {editing ? (
        <label>
          <span className="sr-only">Amount for {l.category}</span>
          <input
            className="amount-input"
            inputMode="numeric"
            value={draft ?? ''}
            onChange={(e) => onDraft(e.target.value.replace(/[^\d]/g, ''))}
          />
        </label>
      ) : (
        <div className="line-amount">
          <b>{money(l.amount, currency)}</b>
          <p>{l.sharePct}%</p>
        </div>
      )}
    </div>
  )
}

export function BudgetView({ input, version, canEdit, onAction }: ViewProps) {
  const [drafts, setDrafts] = useState<Drafts>(null)
  const check = draftTotal(version.lines, drafts, version.budgetTotal)
  const valid = !!drafts && Object.values(drafts).every((x) => /^\d+$/.test(x)) && check.ok

  const startEditing = () =>
    setDrafts(Object.fromEntries(version.lines.map((l) => [l.id, String(l.amount)])))
  const save = () => {
    if (!drafts || !valid) return
    const amounts = Object.fromEntries(Object.entries(drafts).map(([id, x]) => [id, Number(x)]))
    void onAction({ type: 'budget', amounts }, 'Budget saved. Vendor estimates updated.')
    setDrafts(null)
  }

  return (
    <section className="detail">
      <Heading eyebrow="Priority-aware planning" title="Every amount has a reason">
        Your priorities are protected first. Flexible lines give way when something has to.
      </Heading>
      <Ribbon lines={version.lines} />
      <div className="line-table">
        {version.lines.map((l) => (
          <BudgetLineRow
            key={l.id}
            line={l}
            currency={input.currency}
            draft={drafts?.[l.id]}
            editing={!!drafts}
            onDraft={(value) => setDrafts({ ...drafts, [l.id]: value })}
          />
        ))}
      </div>
      <div className="total-check" role="status">
        {check.ok ? <Check size={16} aria-hidden /> : <span aria-hidden>!</span>}
        Allocated <b>{money(check.allocated, input.currency)}</b> of{' '}
        <b>{money(check.target, input.currency)}</b>
        {!check.ok && (
          <span> · {money(check.target - check.allocated, input.currency)} left to place</span>
        )}
      </div>
      {canEdit && (
        <div className="wizard-actions start">
          {drafts ? (
            <>
              <button className="primary-btn" onClick={save} disabled={!valid}>
                Save budget
              </button>
              <button className="outline-btn" onClick={() => setDrafts(null)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="outline-btn" onClick={startEditing}>
              Adjust amounts
            </button>
          )}
        </div>
      )}
    </section>
  )
}
