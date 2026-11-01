'use client'

import { useState } from 'react'
import { CalendarDays, Check, Heart } from 'lucide-react'
import { Ribbon } from '@/components/ribbon'
import type { PlanInput, PlanVersion, Task } from '@/lib/schemas'
import type { PlanAction } from '@/lib/domain/actions'
import { totalCheck } from '@/lib/domain/allocate'
import { taskPriority } from '@/lib/domain/timeline'
import { errorMessage, regenerateIdeas } from '@/lib/api'
import { addDays, dateParts, daysBetween, money, shortDate } from '@/lib/format'
import { LoadingScreen } from '@/components/loading-screen'

export type ViewProps = {
  slug: string
  /** Edit token; null when read-only. */
  token: string | null
  input: PlanInput
  version: PlanVersion
  canEdit: boolean
  onAction: (action: PlanAction, message?: string) => Promise<void>
}


const priorityNames = { high: 'High', medium: 'Medium', low: 'Low' } as const

/** A checkable task with its due label and a priority label decided from the plan's context. */
export function TaskRow({ task, input, canEdit, onToggle }: { task: Task; input: PlanInput; canEdit: boolean; onToggle: () => void }) {
  const p = taskPriority(task, input)
  return (
    <label className="task">
      <input type="checkbox" checked={task.done} disabled={!canEdit} onChange={onToggle} />
      <span className="task-title">
        <span className={task.done ? 'task-done' : ''}>{task.title}</span>
        {!task.done && (
          <span className="prio" data-level={p.level}>
            {priorityNames[p.level]} priority{p.reason && ` · ${p.reason}`}
          </span>
        )}
      </span>
      <small>{task.dueLabel}</small>
    </label>
  )
}

/** Zero-dependency port of 21st.dev CircleProgress. */
export function ProgressRing({ value, total, label }: { value: number; total: number; label: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="ring-wrap" role="img" aria-label={label}>
      <svg className="progress-ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle className="track" cx="32" cy="32" r={r} />
        <circle className="value" cx="32" cy="32" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - (total ? value / total : 0))} />
      </svg>
      <b aria-hidden>
        {value}/{total}
      </b>
    </div>
  )
}

export function PlanningCalendar({ input, today }: { input: PlanInput; today: string }) {
  // Show a window that starts a little before today, so the strip is useful on any day of planning.
  const start = input.planningStart > addDays(today, -14) ? input.planningStart : addDays(today, -14)
  const count = Math.min(60, Math.max(1, daysBetween(start, input.date) + 1))
  const days = Array.from({ length: count }, (_, i) => addDays(start, i))
  return (
    <section className="calendar-panel" aria-labelledby="calendar-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your planning window</span>
          <h2 id="calendar-title">Mark the days that pass</h2>
        </div>
        <CalendarDays aria-hidden />
      </div>
      <p className="calendar-caption">
        Planning since {shortDate(input.planningStart)} · Event on {shortDate(input.date)} · Passed days are crossed out.
      </p>
      <div className="date-strip" tabIndex={0} aria-label="Planning days">
        {days.map((iso) => {
          const p = dateParts(iso)
          return (
            <div
              key={iso}
              className={iso < today ? 'date-cell passed' : iso === today ? 'date-cell today' : 'date-cell'}
              aria-current={iso === today ? 'date' : undefined}
              title={iso < today ? `${shortDate(iso)}, passed` : shortDate(iso)}
            >
              <span>{p.weekday.slice(0, 3)}</span>
              <strong>{p.day}</strong>
              <small>{p.month.slice(0, 3)}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Section heading shared by the detail views. */
export function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children && <p className="serif lead">{children}</p>}
    </>
  )
}

// ---------- Budget ----------

export function BudgetView({ input, version, canEdit, onAction }: ViewProps) {
  const [drafts, setDrafts] = useState<Record<string, string> | null>(null)
  const check = drafts
    ? totalCheck(version.lines.map((l) => ({ ...l, amount: Math.round(Number(drafts[l.id] ?? l.amount)) || 0 })), version.budgetTotal)
    : totalCheck(version.lines, version.budgetTotal)
  const valid = drafts ? Object.values(drafts).every((x) => /^\d+$/.test(x)) && check.ok : false

  const save = () => {
    if (!drafts || !valid) return
    const amounts = Object.fromEntries(Object.entries(drafts).map(([id, x]) => [id, Number(x)]))
    onAction({ type: 'budget', amounts }, 'Budget saved. Vendor estimates updated.')
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
          <div className="line-row" key={l.id}>
            <div>
              <strong>{l.category}</strong>
              {l.isPriority && <span className="priority-label">★ Priority</span>}
              <p>{l.rationale}</p>
              {l.tradeoffNote && <p className="tradeoff">{l.tradeoffNote}</p>}
            </div>
            {drafts ? (
              <label>
                <span className="sr-only">Amount for {l.category}</span>
                <input
                  className="amount-input"
                  inputMode="numeric"
                  value={drafts[l.id] ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [l.id]: e.target.value.replace(/[^\d]/g, '') })}
                />
              </label>
            ) : (
              <div className="line-amount">
                <b>{money(l.amount, input.currency)}</b>
                <p>{l.sharePct}%</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="total-check" role="status">
        {check.ok ? <Check size={16} aria-hidden /> : <span aria-hidden>!</span>}
        Allocated <b>{money(check.allocated, input.currency)}</b> of <b>{money(check.target, input.currency)}</b>
        {!check.ok && <span> · {money(check.target - check.allocated, input.currency)} left to place</span>}
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
            <button className="outline-btn" onClick={() => setDrafts(Object.fromEntries(version.lines.map((l) => [l.id, String(l.amount)])))}>
              Adjust amounts
            </button>
          )}
        </div>
      )}
    </section>
  )
}



// ---------- Ideas ----------

export function IdeasView({ slug, token, version, canEdit, onAction }: ViewProps) {
  const ideas = [...version.ideas].sort((a, b) => Number(b.saved) - Number(a.saved))
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const regenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || busy) return
    setBusy(true)
    setError('')
    try {
      const fresh = await regenerateIdeas(slug, token, feedback.trim())
      await onAction({ type: 'ideas', ideas: fresh }, 'New ideas are ready. Your saved ideas stayed.')
      setFeedback('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="detail" style={{ maxWidth: 1000 }}>
      <Heading eyebrow="Made for you" title="Personal touches that fit">
        Keep the ones that feel like you. Saved ideas move to the top.
      </Heading>
      {canEdit && token && (
        <form className="feedback-row" onSubmit={regenerate}>
          <label>
            <span className="field-hint">What should new ideas lean toward? (optional)</span>
            <input value={feedback} maxLength={300} onChange={(e) => setFeedback(e.target.value)} placeholder="More outdoor, less formal" />
          </label>
          <button className="outline-btn" type="submit" disabled={busy}>
            {busy ? 'Finding new ideas…' : 'Regenerate ideas'}
          </button>
        </form>
      )}
      {busy && (
        <LoadingScreen
          variant="inline"
          title="Finding new ideas"
          steps={['Reading your vibes and needs', 'Keeping the ideas you saved', 'Matching ideas to your priorities']}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="idea-grid">
        {ideas.map((i) => (
          <article className="idea-card" key={i.id}>
            <span className="eyebrow">{i.kind}</span>
            <h3>{i.title}</h3>
            <p>{i.blurb}</p>
            <footer>
              {i.fitsPriority ? <span className="fits">★ Fits {i.fitsPriority}</span> : <span />}
              {canEdit && (
                <button className="save-btn" aria-pressed={i.saved} aria-label={`${i.saved ? 'Unsave' : 'Save'} ${i.title}`} onClick={() => onAction({ type: 'idea', id: i.id })}>
                  <Heart size={18} aria-hidden />
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
