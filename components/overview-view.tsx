'use client'

import { ArrowRight, Check, ChevronRight, Heart, Lightbulb } from 'lucide-react'
import { Ribbon } from '@/components/ribbon'
import { PlanningCalendar, ProgressRing, TaskRow, type ViewProps } from '@/components/plan-views'
import type { View } from '@/components/plan-nav'
import type { WhatIfResult } from '@/lib/schemas'
import { totalCheck } from '@/lib/domain/allocate'
import { nextTasks, savedFirst, vendorProgress } from '@/lib/domain/overview'
import { money } from '@/lib/format'

type OverviewProps = ViewProps & {
  today: string
  onSelect: (v: View) => void
  draft: WhatIfResult | null
}

type HeadingProps = {
  eyebrow: string
  title: string
  titleId?: string
  link: string
  onOpen: () => void
}

/** A section's eyebrow and heading, with a link to the full view. */
function SectionHeading({ eyebrow, title, titleId, link, onOpen }: HeadingProps) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
      </div>
      <button className="text-btn" onClick={onOpen}>
        {link} <ChevronRight aria-hidden />
      </button>
    </div>
  )
}

function BudgetSummary({ input, version, onSelect }: OverviewProps) {
  const check = totalCheck(version.lines, version.budgetTotal)
  return (
    <section className="budget-section" aria-labelledby="budget-title">
      <SectionHeading
        eyebrow="The shape of your spend"
        title="Budget allocation"
        titleId="budget-title"
        link="See full budget"
        onOpen={() => onSelect('budget')}
      />
      <Ribbon lines={version.lines} />
      <div className="budget-total">
        <span>
          <b>{money(version.budgetTotal, input.currency)}</b> total budget
        </span>
        <span>
          {check.ok ? <Check size={16} aria-hidden /> : '!'}{' '}
          {check.ok ? '100% allocated' : 'Not fully allocated'}
        </span>
      </div>
    </section>
  )
}

function NextSteps({ input, version, canEdit, onAction, onSelect }: OverviewProps) {
  const tasks = nextTasks(version, input)
  return (
    <div className="plain-panel">
      <SectionHeading
        eyebrow="The next small steps"
        title="Keep things moving"
        link="Timeline"
        onOpen={() => onSelect('timeline')}
      />
      <div className="task-list">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            input={input}
            canEdit={canEdit}
            onToggle={() => onAction({ type: 'task', id: t.id })}
          />
        ))}
        {!tasks.length && <p className="muted">Everything is done. Enjoy the day.</p>}
      </div>
    </div>
  )
}

/** Invites a what-if, or points back to the draft that is waiting. */
function WhatIfCallout({ draft, onSelect }: OverviewProps) {
  return (
    <div className="callout">
      <span className="eyebrow">{draft ? 'Draft waiting' : 'Try a what-if'}</span>
      <h3>{draft ? draft.draft.scenario : 'What if the guest count changes?'}</h3>
      <p>
        {draft
          ? 'You have a scenario that is not applied yet. Review it, then apply or discard.'
          : 'See what happens to your budget before you make the call. Your priorities stay protected.'}
      </p>
      <button className="outline-btn" onClick={() => onSelect('what-if')}>
        {draft ? 'Review the draft' : 'Open scenario lab'} <ArrowRight aria-hidden />
      </button>
    </div>
  )
}

function VendorSummary({ input, version, onSelect }: OverviewProps) {
  const { total, booked, moving, overQuotes, next } = vendorProgress(version, input)
  return (
    <div>
      <SectionHeading
        eyebrow="Vendor progress"
        title={booked ? 'Good foundations' : 'Where to start'}
        link="Vendors"
        onOpen={() => onSelect('vendors')}
      />
      <div className="vendor-line">
        <ProgressRing value={booked} total={total} label={`${booked} of ${total} vendors booked`} />
        <div>
          <strong>
            {booked} booked{moving ? `, ${moving} in progress` : ''}
          </strong>
          <p className="muted">
            {next.length
              ? `Next to compare: ${next.map((v) => v.category).join(', ')}.`
              : 'Every vendor is booked.'}
          </p>
          {overQuotes.length > 0 && (
            <p className="quote-note" data-check="over">
              {overQuotes.length === 1 ? '1 quote is' : `${overQuotes.length} quotes are`} over the
              planning range: {overQuotes.map((v) => v.name || v.category).join(', ')}.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function IdeasToKeep({ version, canEdit, onAction, onSelect }: OverviewProps) {
  return (
    <div>
      <SectionHeading
        eyebrow="Made for you"
        title="Ideas to keep"
        link="All ideas"
        onOpen={() => onSelect('ideas')}
      />
      {savedFirst(version.ideas)
        .slice(0, 3)
        .map((i) => (
          <div className="idea-row" key={i.id}>
            <Lightbulb size={17} aria-hidden />
            <div>
              <span>{i.kind}</span>
              <strong>{i.title}</strong>
            </div>
            {canEdit && (
              <button
                className="save-btn"
                aria-pressed={i.saved}
                aria-label={`Save ${i.title}`}
                onClick={() => onAction({ type: 'idea', id: i.id })}
              >
                <Heart size={18} aria-hidden />
              </button>
            )}
          </div>
        ))}
    </div>
  )
}

/** The plan at a glance: calendar, budget, next tasks, the what-if invitation, vendors and ideas. */
export function Overview(props: OverviewProps) {
  return (
    <>
      {props.version.narrative && <p className="narrative">{props.version.narrative}</p>}
      <PlanningCalendar input={props.input} today={props.today} />
      <BudgetSummary {...props} />
      <section className="overview-grid">
        <NextSteps {...props} />
        <WhatIfCallout {...props} />
      </section>
      <section className="lower-grid">
        <VendorSummary {...props} />
        <IdeasToKeep {...props} />
      </section>
    </>
  )
}
