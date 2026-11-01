'use client'

import { Check } from 'lucide-react'
import { RibbonGlow } from '@/components/ribbon-glow'
import { EVENT_TYPES, LIMITS, type PlanInput } from '@/lib/schemas'
import { categories } from '@/lib/categories'
import { eventColors, eventLabels } from '@/lib/event-theme'
import { splitList, togglePriority } from '@/lib/plan-form'

export type StepProps = { plan: PlanInput; update: (patch: Partial<PlanInput>) => void }

/** Step 1: the event type, as three glowing cards. Switching type clears priorities (categories differ). */
export function EventStep({ plan, update }: StepProps) {
  return (
    <div className="choice-grid" role="group" aria-label="Event type">
      {EVENT_TYPES.map((k) => {
        const selected = plan.eventType === k
        const { accent, light, glow } = eventColors[k]
        return (
          <button
            key={k}
            type="button"
            className="choice event-card"
            data-event={k}
            aria-pressed={selected}
            onClick={() => update({ eventType: k, priorities: selected ? plan.priorities : [] })}
          >
            <RibbonGlow colors={[accent, light, glow]} />
            <span className="event-card-label">{eventLabels[k]}</span>
            {selected && (
              <span className="event-card-check" aria-hidden>
                <Check /> Selected
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Step 3: up to three ranked priorities; the rest say why they are unavailable once three are picked. */
export function PrioritiesStep({ plan, update }: StepProps) {
  const full = plan.priorities.length >= LIMITS.maxPriorities
  return (
    <>
      <p className="muted" id="h-priorities">
        Pick up to three, in order. Your first pick is protected most when money gets tight.
      </p>
      <div
        className="choice-grid"
        role="group"
        aria-label="Priorities"
        aria-describedby="h-priorities"
      >
        {categories[plan.eventType].map((item) => {
          const rank = plan.priorities.indexOf(item)
          return (
            <button
              key={item}
              type="button"
              className="choice"
              aria-pressed={rank >= 0}
              aria-disabled={rank < 0 && full ? true : undefined}
              onClick={() => update({ priorities: togglePriority(plan.priorities, item) })}
            >
              {rank >= 0 && <b>{rank + 1}. </b>}
              {item}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** Step 4: the feeling, food needs, access and free notes. */
export function StyleStep({ plan, update }: StepProps) {
  return (
    <div className="form-stack">
      <label>
        The feeling you want
        <input
          defaultValue={plan.vibes.join(', ')}
          aria-describedby="h-vibes"
          onChange={(e) => update({ vibes: splitList(e.target.value) })}
          placeholder="Garden, warm, playful"
        />
        <span className="field-hint" id="h-vibes">
          Up to four words, separated by commas.
        </span>
      </label>
      <label>
        Food needs
        <input
          defaultValue={plan.diet.join(', ')}
          aria-describedby="h-diet"
          onChange={(e) => update({ diet: splitList(e.target.value) })}
          placeholder="Vegetarian, Jain, nut-free"
        />
        <span className="field-hint" id="h-diet">
          Separate each need with a comma.
        </span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={plan.accessibility}
          onChange={(e) => update({ accessibility: e.target.checked })}
        />
        Step-free access matters for our guests
      </label>
      <label>
        Anything else we should know?
        <textarea
          maxLength={LIMITS.notesChars}
          aria-describedby="h-notes"
          value={plan.notes ?? ''}
          onChange={(e) => update({ notes: e.target.value })}
        />
        <span className="field-hint" id="h-notes">
          {LIMITS.notesChars - (plan.notes?.length ?? 0)} characters left
        </span>
      </label>
    </div>
  )
}
