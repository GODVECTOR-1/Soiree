'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Heading, TaskRow, type ViewProps } from '@/components/plan-views'
import { allTasks } from '@/lib/domain/timeline'
import { dayOfSchedule, defaultStart } from '@/lib/domain/dayof'
import { toIcs } from '@/lib/domain/calendar'
import { todayIso } from '@/lib/format'

/** Save every open task as an all-day calendar entry with a reminder the day before. Runs in the browser only. */
function downloadReminders({ slug, input, version }: Pick<ViewProps, 'slug' | 'input' | 'version'>) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const ics = toIcs({ input, tasks: allTasks(version.phases), today: todayIso(), stamp, uid: slug })
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `soiree-${slug}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

export function TimelineView({ slug, input, version, canEdit, onAction }: ViewProps) {
  const [start, setStart] = useState(defaultStart[input.eventType])
  const open = allTasks(version.phases).filter((t) => !t.done).length
  return (
    <section className="detail">
      <Heading eyebrow="Timeline" title="A calm path to the day">
        Anything already overdue moved to this week, so nothing slips quietly.
      </Heading>
      <div className="timeline-actions">
        <button className="outline-btn" onClick={() => downloadReminders({ slug, input, version })} disabled={!open}>
          <CalendarPlus aria-hidden /> Add {open} reminders to your calendar
        </button>
        <span className="field-hint">Works with Google, Apple and Outlook calendars. Each reminder arrives the day before.</span>
      </div>
      <div className="timeline">
        {version.phases.map((p, i) => (
          <section key={p.id} aria-labelledby={`phase-${p.id}`}>
            <div className="phase-head">
              <span aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <h3 id={`phase-${p.id}`}>{p.label}</h3>
              <small>
                {p.tasks.filter((t) => t.done).length} of {p.tasks.length} done
              </small>
            </div>
            <div className="task-list">
              {p.tasks.map((t) => (
                <TaskRow key={t.id} task={t} input={input} canEdit={canEdit} onToggle={() => onAction({ type: 'task', id: t.id })} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="run-sheet" aria-labelledby="run-sheet-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">On the day</span>
            <h2 id="run-sheet-title">Day-of run sheet</h2>
          </div>
          <label className="start-time">
            Guests arrive at
            <input type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
        </div>
        <p className="muted">Built from your plan: setup, the key moments, and steps for your guests&apos; needs. Share it with every vendor two weeks out.</p>
        <ol>
          {dayOfSchedule(input, start).map((item) => (
            <li key={`${item.at}-${item.title}`}>
              <time>{item.time}</time>
              <span>{item.title}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
