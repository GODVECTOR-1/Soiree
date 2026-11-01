'use client'

import { CalendarDays } from 'lucide-react'
import type { PlanInput, PlanVersion, Task } from '@/lib/schemas'
import type { PlanAction } from '@/lib/domain/actions'
import { taskPriority } from '@/lib/domain/timeline'
import { addDays, dateParts, daysBetween, shortDate } from '@/lib/format'

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
export function TaskRow({
  task,
  input,
  canEdit,
  onToggle,
}: {
  task: Task
  input: PlanInput
  canEdit: boolean
  onToggle: () => void
}) {
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
export function ProgressRing({
  value,
  total,
  label,
}: {
  value: number
  total: number
  label: string
}) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="ring-wrap" role="img" aria-label={label}>
      <svg className="progress-ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle className="track" cx="32" cy="32" r={r} />
        <circle
          className="value"
          cx="32"
          cy="32"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - (total ? value / total : 0))}
        />
      </svg>
      <b aria-hidden>
        {value}/{total}
      </b>
    </div>
  )
}

/** A day before today is crossed out; today is ringed. */
function dateCellClass(iso: string, today: string) {
  if (iso < today) return 'date-cell passed'
  return iso === today ? 'date-cell today' : 'date-cell'
}

export function PlanningCalendar({ input, today }: { input: PlanInput; today: string }) {
  // Show a window that starts a little before today, so the strip is useful on any day of planning.
  const start =
    input.planningStart > addDays(today, -14) ? input.planningStart : addDays(today, -14)
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
        Planning since {shortDate(input.planningStart)} · Event on {shortDate(input.date)} · Passed
        days are crossed out.
      </p>
      {/* Scrollable, so it takes focus for keyboard scrolling and is named as a region. */}
      <div className="date-strip" tabIndex={0} role="region" aria-label="Planning days">
        {days.map((iso) => {
          const p = dateParts(iso)
          return (
            <div
              key={iso}
              className={dateCellClass(iso, today)}
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
export function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children && <p className="serif lead">{children}</p>}
    </>
  )
}
