'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { PlanInput, ScenarioInput } from '@/lib/schemas'
import { categories } from '@/lib/categories'
import { MAX_PRIORITIES, togglePriority } from '@/lib/plan-form'

/** Run a scenario; `label` marks which preset is active. Resolves true when the server returned a draft. */
export type RunScenario = (s: ScenarioInput, label?: string) => Promise<boolean>

type ControlProps = {
  input: PlanInput
  busy: boolean
  /** The label of the preset behind the current draft, if any. */
  activePreset: string
  run: RunScenario
}

/** One-click scenarios that make sense for this plan (no venue to cancel for a community event, for example). */
function presetsFor(input: PlanInput) {
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
  return presets.filter((p) => !p.hidden)
}

type PickerProps = ControlProps & { picked: string[]; onPick: (next: string[] | null) => void }

/** Re-rank priorities (up to three), then see what the new order does to the budget. */
function PriorityPicker({ input, busy, run, picked, onPick }: PickerProps) {
  return (
    <div className="scenario-box flush">
      <span className="muted">Pick up to three, in order. Your first pick is protected most.</span>
      <div className="chip-row" role="group" aria-label="New priorities">
        {categories[input.eventType].map((c) => {
          const rank = picked.indexOf(c)
          return (
            <button
              key={c}
              className="chip"
              aria-pressed={rank >= 0}
              aria-disabled={rank < 0 && picked.length >= MAX_PRIORITIES ? true : undefined}
              onClick={() => onPick(togglePriority(picked, c))}
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
          onClick={() => run({ kind: 'reprioritize', priorities: picked }, 'Change priorities')}
          disabled={busy || !picked.length}
        >
          See the trade-off <ArrowRight aria-hidden />
        </button>
      </div>
    </div>
  )
}

type PresetProps = ControlProps & {
  hasDraft: boolean
  /** The priorities being re-ranked; null while the picker is closed. */
  picked: string[] | null
  onPick: (next: string[] | null) => void
}

/** The preset chips and the "Change priorities" toggle that opens the picker. */
function PresetScenarios(props: PresetProps) {
  const { input, busy, activePreset, run, hasDraft, picked, onPick } = props
  return (
    <>
      <div className="chip-row" role="group" aria-label="Quick scenarios">
        {presetsFor(input).map((p) => (
          <button
            key={p.label}
            className="chip"
            aria-pressed={hasDraft && activePreset === p.label}
            onClick={() => run(p.s, p.label)}
            disabled={busy}
          >
            {p.label}
          </button>
        ))}
        <button
          className="chip"
          aria-pressed={!!picked}
          aria-expanded={!!picked}
          onClick={() => onPick(picked ? null : input.priorities)}
          disabled={busy}
        >
          Change priorities
        </button>
      </div>
      {picked && <PriorityPicker {...props} picked={picked} onPick={onPick} />}
    </>
  )
}

function GuestSlider({ input, busy, run }: ControlProps) {
  const [guests, setGuests] = useState(input.guestCount)
  return (
    <>
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
    </>
  )
}

/** A change described in the user's own words; the server maps it to a supported scenario or says it can't. */
function CustomScenario({ busy, run }: ControlProps) {
  const [text, setText] = useState('')
  return (
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
  )
}

/** Every way to ask "what if": presets, new priorities, a guest count, or plain words. */
export function ScenarioControls(props: ControlProps & { hasDraft: boolean }) {
  const [picked, setPicked] = useState<string[] | null>(null)
  // A scenario that ran closes the priority picker, whichever control started it.
  const run: RunScenario = async (s, label) => {
    const ok = await props.run(s, label)
    if (ok) setPicked(null)
    return ok
  }
  const controls = { ...props, run }
  return (
    <div className="scenario-box">
      <PresetScenarios {...controls} picked={picked} onPick={setPicked} />
      <GuestSlider {...controls} />
      <CustomScenario {...controls} />
    </div>
  )
}
