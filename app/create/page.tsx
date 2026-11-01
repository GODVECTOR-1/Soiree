'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { RibbonGlow } from '@/components/ribbon-glow'
import { LoadingScreen } from '@/components/loading-screen'
import { PlanInput, type Currency, type EventType } from '@/lib/schemas'
import { categories } from '@/lib/categories'
import { createPlan, errorMessage } from '@/lib/api'
import { rememberPlan, saveToken } from '@/lib/local-plans'
import { money, shortDate, todayIso } from '@/lib/format'
import { useHydrated } from '@/lib/use-hydrated'
import { eventColors, eventLabels } from '@/lib/event-theme'
import {
  MAX_PRIORITIES,
  basicsErrors,
  blankInput,
  parseDraft,
  splitList,
  togglePriority,
  type BasicsField,
} from '@/lib/plan-form'

const DRAFT_KEY = 'soiree:wizard'
const NOTES_MAX = 600
const tiers = [
  { value: 1, label: 'Metro' },
  { value: 2, label: 'Large city' },
  { value: 3, label: 'Smaller town' },
] as const
const currencies: Currency[] = ['INR', 'USD', 'EUR', 'GBP']
const titles = [
  'What are you celebrating?',
  'The basics',
  'What matters most?',
  'Style and needs',
  'Review your plan',
]
const STEPS = titles.length
const events = Object.keys(eventLabels) as EventType[]

function restoreDraft(today: string): PlanInput {
  try {
    return parseDraft(sessionStorage.getItem(DRAFT_KEY), today)
  } catch {
    return parseDraft(null, today) // storage blocked
  }
}

/** Session storage is a convenience: a blocked or full store must never break the wizard. */
function storeDraft(draft: PlanInput | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Ignore.
  }
}

export default function CreatePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [edits, setEdits] = useState<PlanInput | null>(null)
  const [errors, setErrors] = useState<Partial<Record<BasicsField, string>>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const firstStep = useRef(true)
  // Dates and the saved draft only exist in the browser; reading them after hydration avoids mismatches.
  const hydrated = useHydrated()
  const today = hydrated ? todayIso() : ''
  const plan = edits ?? (hydrated ? restoreDraft(today) : blankInput)

  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    heading.current?.focus()
  }, [step])

  const update = (patch: Partial<PlanInput>) => {
    const next = { ...plan, ...patch }
    setEdits(next)
    storeDraft(next)
  }

  const goNext = () => {
    setFormError('')
    if (step === 2) {
      const found = basicsErrors(plan, today)
      setErrors(found)
      const first = Object.keys(found)[0]
      if (first) {
        document.getElementById(`f-${first}`)?.focus()
        return
      }
    }
    if (step === 3 && !plan.priorities.length) {
      setFormError('Choose at least one priority.')
      return
    }
    setStep((s) => Math.min(STEPS, s + 1))
  }

  const finish = async () => {
    const parsed = PlanInput.safeParse(plan)
    if (!parsed.success) {
      setFormError('Something is missing. Go back and check the basics.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const { slug, editToken } = await createPlan(parsed.data)
      saveToken(slug, editToken)
      const { title, eventType, date } = parsed.data
      rememberPlan({ slug, title, eventType, date })
      storeDraft(null)
      router.push(`/plan/${slug}#edit=${editToken}`)
    } catch (e) {
      setFormError(errorMessage(e))
      setFailed(true)
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (step < STEPS) goNext()
    else void finish()
  }

  /** Id, validity and description wiring for a basics field; `hint` links its help text too. */
  const field = (name: BasicsField, hint = false) => ({
    id: `f-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby':
      [hint && `h-${name}`, errors[name] && `e-${name}`].filter(Boolean).join(' ') || undefined,
  })
  const fieldError = (name: BasicsField) =>
    errors[name] ? (
      <span className="field-error" id={`e-${name}`}>
        {errors[name]}
      </span>
    ) : null
  const full = plan.priorities.length >= MAX_PRIORITIES

  return (
    <div className="wizard-page" data-event={plan.eventType}>
      <header className="plan-top">
        <Link className="brand" href="/">
          Soirée <span>New plan</span>
        </Link>
        <span className="muted">
          Step {step} of {STEPS}
        </span>
      </header>
      <div className="wizard-layout">
        <main id="main">
          <form onSubmit={onSubmit} noValidate aria-labelledby="wizard-title">
            <ol className="stepper" aria-hidden>
              {titles.map((t, i) => (
                <li key={t} data-done={i < step} />
              ))}
            </ol>
            <span className="eyebrow">Create your plan</span>
            <h1 id="wizard-title" ref={heading} tabIndex={-1}>
              {titles[step - 1]}
            </h1>

            {step === 1 && (
              <div className="choice-grid" role="group" aria-label="Event type">
                {events.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="choice event-card"
                    data-event={k}
                    aria-pressed={plan.eventType === k}
                    onClick={() =>
                      update({
                        eventType: k,
                        priorities: plan.eventType === k ? plan.priorities : [],
                      })
                    }
                  >
                    <RibbonGlow
                      colors={[eventColors[k].accent, eventColors[k].light, eventColors[k].glow]}
                    />
                    <span className="event-card-label">{eventLabels[k]}</span>
                    {plan.eventType === k && (
                      <span className="event-card-check" aria-hidden>
                        <Check /> Selected
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="form-stack">
                <label>
                  Celebration name
                  <input
                    {...field('title')}
                    maxLength={80}
                    autoComplete="off"
                    value={plan.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                  {fieldError('title')}
                </label>
                <label>
                  City
                  <input
                    {...field('city')}
                    maxLength={40}
                    autoComplete="address-level2"
                    value={plan.city}
                    onChange={(e) => update({ city: e.target.value })}
                  />
                  {fieldError('city')}
                </label>
                <fieldset className="segmented" aria-describedby="h-tier">
                  <legend>City size</legend>
                  <div>
                    {tiers.map((t) => (
                      <label key={t.value}>
                        <input
                          type="radio"
                          name="tier"
                          checked={plan.cityTier === t.value}
                          onChange={() => update({ cityTier: t.value })}
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                  <span className="field-hint" id="h-tier">
                    Smaller towns usually spend less on the venue, so more goes to your priorities.
                  </span>
                </fieldset>
                <div className="form-row">
                  <label>
                    Event date
                    <input
                      {...field('date')}
                      type="date"
                      min={today || undefined}
                      value={plan.date}
                      onChange={(e) => update({ date: e.target.value })}
                    />
                    {fieldError('date')}
                  </label>
                  <label>
                    Planning starts
                    <input
                      {...field('planningStart')}
                      type="date"
                      max={plan.date || undefined}
                      value={plan.planningStart}
                      onChange={(e) => update({ planningStart: e.target.value })}
                    />
                    {fieldError('planningStart')}
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Expected guests
                    <input
                      {...field('guestCount')}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={5000}
                      value={plan.guestCount || ''}
                      onChange={(e) => update({ guestCount: Number(e.target.value) })}
                    />
                    {fieldError('guestCount')}
                  </label>
                  <label>
                    Currency
                    <select
                      value={plan.currency}
                      onChange={(e) => update({ currency: e.target.value as Currency })}
                    >
                      {currencies.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Total budget
                  <input
                    {...field('totalBudget', plan.totalBudget > 0)}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={plan.totalBudget || ''}
                    onChange={(e) => update({ totalBudget: Number(e.target.value) })}
                  />
                  {plan.totalBudget > 0 && (
                    <span className="field-hint" id="h-totalBudget">
                      {money(plan.totalBudget, plan.currency)}
                    </span>
                  )}
                  {fieldError('totalBudget')}
                </label>
              </div>
            )}

            {step === 3 && (
              <>
                <p className="muted" id="h-priorities">
                  Pick up to three, in order. Your first pick is protected most when money gets
                  tight.
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
                        onClick={() =>
                          update({ priorities: togglePriority(plan.priorities, item) })
                        }
                      >
                        {rank >= 0 && <b>{rank + 1}. </b>}
                        {item}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {step === 4 && (
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
                    maxLength={NOTES_MAX}
                    aria-describedby="h-notes"
                    value={plan.notes ?? ''}
                    onChange={(e) => update({ notes: e.target.value })}
                  />
                  <span className="field-hint" id="h-notes">
                    {NOTES_MAX - (plan.notes?.length ?? 0)} characters left
                  </span>
                </label>
              </div>
            )}

            {step === 5 && (
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
            )}

            {busy && (
              <LoadingScreen
                title="Building your plan"
                steps={[
                  'Balancing the budget around your priorities',
                  'Laying out a timeline that fits your date',
                  'Writing questions to ask each vendor',
                  'Gathering ideas that feel like you',
                  'Checking every number adds up',
                ]}
              />
            )}
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="wizard-actions">
              {step > 1 && (
                <button type="button" className="outline-btn" onClick={() => setStep((s) => s - 1)}>
                  Back
                </button>
              )}
              <button type="submit" className="primary-btn" disabled={busy}>
                {step < STEPS
                  ? 'Continue'
                  : busy
                    ? 'Building your plan…'
                    : failed
                      ? 'Try again'
                      : 'Generate my plan'}{' '}
                <ArrowRight aria-hidden />
              </button>
            </div>
          </form>
        </main>

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
      </div>
    </div>
  )
}
