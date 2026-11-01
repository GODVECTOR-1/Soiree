import type { PlanInput } from '@/lib/schemas'
import { money, shortDate } from '@/lib/format'
import { eventLabels } from '@/lib/event-theme'

/** Step 5: everything entered, for a last look before the plan is generated. */
export function ReviewStep({ plan }: { plan: PlanInput }) {
  return (
    <div className="review-card">
      <h2 className="review-title">{plan.title}</h2>
      <dl>
        <dt>Event</dt>
        <dd>
          {eventLabels[plan.eventType]} in {plan.city}
        </dd>
        <dt>Date</dt>
        <dd>{plan.date ? shortDate(plan.date) : 'Not set'}</dd>
        <dt>Guests</dt>
        <dd>{plan.guestCount}</dd>
        <dt>Budget</dt>
        <dd>{money(plan.totalBudget, plan.currency)}</dd>
        <dt>Priorities</dt>
        <dd>{plan.priorities.map((p, i) => `${i + 1}. ${p}`).join(' · ')}</dd>
        {plan.vibes.length > 0 && (
          <>
            <dt>Feeling</dt>
            <dd>{plan.vibes.join(', ')}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

/** The running summary beside the wizard; a dash marks what is not filled in yet. */
export function WizardSummary({ plan }: { plan: PlanInput }) {
  return (
    <aside className="wizard-summary" aria-label="Plan summary">
      <span className="eyebrow">A plan with breathing room</span>
      <h2>{plan.title || 'Your celebration'}</h2>
      <dl>
        <dt>Type</dt>
        <dd>{eventLabels[plan.eventType]}</dd>
        <dt>Where</dt>
        <dd>{plan.city || '—'}</dd>
        <dt>When</dt>
        <dd>{plan.date ? shortDate(plan.date) : '—'}</dd>
        <dt>Guests</dt>
        <dd>{plan.guestCount || '—'}</dd>
        <dt>Budget</dt>
        <dd>{plan.totalBudget ? money(plan.totalBudget, plan.currency) : '—'}</dd>
        <dt>Priorities</dt>
        <dd>{plan.priorities.join(', ') || '—'}</dd>
      </dl>
    </aside>
  )
}
