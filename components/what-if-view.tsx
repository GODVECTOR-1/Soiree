'use client'

import { useState } from 'react'
import { ArrowRight, Check, Lock } from 'lucide-react'
import type { ScenarioInput, WhatIfResult } from '@/lib/schemas'
import { categories } from '@/lib/categories'
import { discardDraft, errorMessage, runWhatIf } from '@/lib/api'
import { money } from '@/lib/format'
import { MAX_PRIORITIES, togglePriority } from '@/lib/plan-form'
import { Heading, type ViewProps } from '@/components/plan-views'
import { LoadingScreen } from '@/components/loading-screen'

type WhatIfProps = ViewProps & {
  draft: WhatIfResult | null
  onDraft: (d: WhatIfResult | null) => void
  onApply: (d: WhatIfResult) => void
}

/** Scenario lab: presets, priorities, guest slider and free text. The server result is the only result. */
export function WhatIfView({ slug, token, input, canEdit, draft, onDraft, onApply }: WhatIfProps) {
  const [guests, setGuests] = useState(input.guestCount)
  const [active, setActive] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [text, setText] = useState('')
  const half = Math.max(1, Math.round(input.guestCount / 2))
  const presets: { label: string; s: ScenarioInput; hidden?: boolean }[] = [
    { label: 'Cut budget 20%', s: { kind: 'budget_change', value: -20 } },
    { label: 'Add 10% to budget', s: { kind: 'budget_change', value: 10 } },
    {
      label: 'Add 20 guests',
      s: { kind: 'guest_change', value: input.guestCount + 20 },
      hidden: input.guestCount + 20 > 5000,
    },
    {
      label: 'Halve the guest list',
      s: { kind: 'guest_change', value: half },
      hidden: half === input.guestCount,
    },
    {
      label: 'Venue cancelled',
      s: { kind: 'venue_cancelled' },
      hidden: input.eventType === 'community',
    },
    { label: 'Move date 14 days later', s: { kind: 'date_change', value: 14 } },
  ]

  const run = async (s: ScenarioInput, label = '') => {
    if (!token || busy) return
    setActive(label)
    setBusy(true)
    setError('')
    try {
      onDraft(await runWhatIf(slug, token, s)) // the server result is the only result
      setPicking(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const discard = () => {
    onDraft(null)
    if (token) discardDraft(slug, token).catch(() => undefined) // the next what-if replaces it anyway
  }

  return (
    <section className="detail">
      <Heading eyebrow="A living plan" title="Make a change, see the trade-off">
        Test a scenario before it becomes a decision. Nothing changes until you apply it.
      </Heading>

      {canEdit && token ? (
        <div className="scenario-box">
          <div className="chip-row" role="group" aria-label="Quick scenarios">
            {presets
              .filter((p) => !p.hidden)
              .map((p) => (
                <button
                  key={p.label}
                  className="chip"
                  aria-pressed={!!draft && active === p.label}
                  onClick={() => run(p.s, p.label)}
                  disabled={busy}
                >
                  {p.label}
                </button>
              ))}
            <button
              className="chip"
              aria-pressed={picking}
              aria-expanded={picking}
              onClick={() => {
                setPicking((v) => !v)
                setPicked(input.priorities)
              }}
              disabled={busy}
            >
              Change priorities
            </button>
          </div>
          {picking && (
            <div className="scenario-box flush">
              <span className="muted">
                Pick up to three, in order. Your first pick is protected most.
              </span>
              <div className="chip-row" role="group" aria-label="New priorities">
                {categories[input.eventType].map((c) => {
                  const rank = picked.indexOf(c)
                  return (
                    <button
                      key={c}
                      className="chip"
                      aria-pressed={rank >= 0}
                      aria-disabled={rank < 0 && picked.length >= MAX_PRIORITIES ? true : undefined}
                      onClick={() => setPicked((p) => togglePriority(p, c))}
                    >
                      {rank >= 0 && <b>{rank + 1}. </b>}
                      {rank >= 0 && <span aria-hidden>★ </span>}
                      {c}
                    </button>
                  )
                })}
              </div>
              <div>
                <button
                  className="primary-btn"
                  onClick={() =>
                    run({ kind: 'reprioritize', priorities: picked }, 'Change priorities')
                  }
                  disabled={busy || !picked.length}
                >
                  See the trade-off <ArrowRight aria-hidden />
                </button>
              </div>
            </div>
          )}
          <label>
            <span>
              Or set the guest count: <b>{guests}</b>
            </span>
            <input
              type="range"
              min={Math.max(1, Math.round(input.guestCount * 0.5))}
              max={Math.min(5000, Math.round(input.guestCount * 2))}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
            />
          </label>
          <div>
            <button
              className="primary-btn"
              onClick={() => run({ kind: 'guest_change', value: guests })}
              disabled={busy || guests === input.guestCount}
            >
              See the trade-off <ArrowRight aria-hidden />
            </button>
          </div>
          <form
            className="feedback-row flush"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) void run({ kind: 'custom', text: text.trim() }, 'custom')
            }}
          >
            <label>
              <span>Or describe a change in your own words</span>
              <input
                value={text}
                maxLength={300}
                onChange={(e) => setText(e.target.value)}
                placeholder="What if we cut the budget by 15%?"
              />
            </label>
            <button className="outline-btn" type="submit" disabled={busy || !text.trim()}>
              Try it
            </button>
          </form>
        </div>
      ) : (
        <p className="muted">
          You are viewing a shared plan. Scenarios are available to the plan owner.
        </p>
      )}

      {busy && (
        <LoadingScreen
          variant="inline"
          title="Working out the trade-off"
          steps={[
            'Recomputing every line in code',
            'Protecting your priorities',
            'Writing a short explanation',
          ]}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {draft && !busy && (
          <>
            <div className="draft-banner">
              <span>
                <b>Draft: {draft.draft.scenario}.</b> Your plan has not changed yet.
              </span>
              <div>
                <button className="primary-btn" onClick={() => onApply(draft)}>
                  Apply
                </button>
                <button className="outline-btn" onClick={discard}>
                  Discard
                </button>
              </div>
            </div>
            <p className="narrative">{draft.draft.narrative}</p>
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
              {draft.diff.rows.map((r) => (
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
                    {money(r.before, input.currency)}
                  </span>
                  <span role="cell">
                    <b>{money(r.after, input.currency)}</b>
                  </span>
                  <span role="cell" className={r.deltaPct < 0 ? 'delta down' : 'delta'}>
                    {r.deltaPct === 0 ? 'No change' : `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%`}
                  </span>
                </div>
              ))}
            </div>
            <div className="total-check">
              {draft.diff.totalCheck.ok ? (
                <Check size={16} aria-hidden />
              ) : (
                <span aria-hidden>!</span>
              )}
              Allocated <b>{money(draft.diff.totalCheck.allocated, input.currency)}</b> of{' '}
              <b>{money(draft.diff.totalCheck.target, input.currency)}</b>
              {draft.diff.totalCheck.ok ? ' · Adds up exactly' : ' · Does not add up'}
            </div>
            {draft.diff.impactedTasks.length > 0 && (
              <div className="impacted">
                <span className="eyebrow">Tasks to revisit</span>
                <ul className="muted">
                  {draft.diff.impactedTasks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
