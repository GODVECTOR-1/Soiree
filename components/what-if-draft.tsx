'use client'

import { Check, Lock } from 'lucide-react'
import type { Currency, WhatIfResult } from '@/lib/schemas'
import { money } from '@/lib/format'

type Diff = WhatIfResult['diff']

const changeText = (deltaPct: number) =>
  deltaPct === 0 ? 'No change' : `${deltaPct > 0 ? '+' : ''}${deltaPct}%`

/** Every budget line before and after, with protected priorities marked. */
function DiffTable({ rows, currency }: { rows: Diff['rows']; currency: Currency }) {
  return (
    <div className="line-table" role="table" aria-label="Budget before and after">
      <div className="diff-row eyebrow" role="row">
        <span role="columnheader">Line</span>
        <span role="columnheader" className="before">
          Before
        </span>
        <span role="columnheader">After</span>
        <span role="columnheader" className="delta">
          Change
        </span>
      </div>
      {rows.map((r) => (
        <div className="diff-row" role="row" key={r.category}>
          <span role="cell">
            {r.category}
            {r.protected && (
              <span className="badge">
                <Lock size={10} aria-hidden /> Protected
              </span>
            )}
          </span>
          <span role="cell" className="before">
            {money(r.before, currency)}
          </span>
          <span role="cell">
            <b>{money(r.after, currency)}</b>
          </span>
          <span role="cell" className={r.deltaPct < 0 ? 'delta down' : 'delta'}>
            {changeText(r.deltaPct)}
          </span>
        </div>
      ))}
    </div>
  )
}

type Props = {
  draft: WhatIfResult
  currency: Currency
  onApply: () => void
  onDiscard: () => void
}

/** A computed scenario waiting for a decision: what changed, why, whether it adds up, and what to revisit. */
export function DraftResult({ draft, currency, onApply, onDiscard }: Props) {
  const { totalCheck: total, rows, impactedTasks } = draft.diff
  return (
    <>
      <div className="draft-banner">
        <span>
          <b>Draft: {draft.draft.scenario}.</b> Your plan has not changed yet.
        </span>
        <div>
          <button className="primary-btn" onClick={onApply}>
            Apply
          </button>
          <button className="outline-btn" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
      <p className="narrative">{draft.draft.narrative}</p>
      <DiffTable rows={rows} currency={currency} />
      <div className="total-check">
        {total.ok ? <Check size={16} aria-hidden /> : <span aria-hidden>!</span>}
        Allocated <b>{money(total.allocated, currency)}</b> of{' '}
        <b>{money(total.target, currency)}</b>
        {total.ok ? ' · Adds up exactly' : ' · Does not add up'}
      </div>
      {impactedTasks.length > 0 && (
        <div className="impacted">
          <span className="eyebrow">Tasks to revisit</span>
          <ul className="muted">
            {impactedTasks.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
