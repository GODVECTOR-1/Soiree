'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { RibbonGlow } from '@/components/ribbon-glow'
import { PlanInput, type Currency, type EventType } from '@/lib/schemas'
import { categories } from '@/lib/categories'
import { createPlan, errorMessage } from '@/lib/api'
import { rememberPlan, saveToken } from '@/lib/local-plans'
import { money, shortDate, todayIso } from '@/lib/format'
import { useHydrated } from '@/lib/use-hydrated'
import { LoadingScreen } from '@/components/loading-screen'

const DRAFT_KEY = 'soiree:wizard'
const eventLabels: Record<EventType, string> = { wedding: 'Wedding', birthday: 'Birthday', community: 'Community gathering' }
// Ribbon colours per event card: each event's accent, a lighter partner, and the landing page's mood colour.
const ribbonColors: Record<EventType, string[]> = {
  wedding: ['#b5446e', '#ff8fc7', '#ff00b3'],
  birthday: ['#c4421f', '#ffa54d', '#ef4c04'],
  community: ['#0b7f6b', '#5fd4b8', '#14b8a0'],
}
const tiers = [
  { value: 1, label: 'Metro' },
  { value: 2, label: 'Large city' },
  { value: 3, label: 'Smaller town' },
] as const
const currencies: Currency[] = ['INR', 'USD', 'EUR', 'GBP']
const titles = ['What are you celebrating?', 'The basics', 'What matters most?', 'Style and needs', 'Review your plan']

const blank: PlanInput = {
  eventType: 'wedding', title: '', city: '', date: '', planningStart: '', guestCount: 0, cityTier: 1,
  currency: 'INR', totalBudget: 0, priorities: [], vibes: [], diet: [], accessibility: false, notes: '',
}

function restoreDraft(today: string): PlanInput {
  try {
    const saved = PlanInput.safeParse(JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null'))
    if (saved.success) return saved.data
  } catch {
    // Fall through to a fresh draft.
  }
  return { ...blank, planningStart: today }
}

const splitList = (value: string) => value.split(',').map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 4)

/** Field-level checks for step 2, in plain language. */
function basicsErrors(p: PlanInput, today: string) {
  const errors: Partial<Record<'title' | 'city' | 'date' | 'planningStart' | 'guestCount' | 'totalBudget', string>> = {}
  if (!p.title.trim()) errors.title = 'Give your celebration a name.'
  if (!p.city.trim()) errors.city = 'Add the city, so costs fit the place.'
  if (!p.date) errors.date = 'Pick the event date.'
  else if (p.date < today) errors.date = 'The event date must be today or later.'
  if (!p.planningStart) errors.planningStart = 'Pick when planning starts.'
  else if (p.date && p.planningStart > p.date) errors.planningStart = 'Planning must start on or before the event.'
  if (!Number.isInteger(p.guestCount) || p.guestCount < 1 || p.guestCount > 5000) errors.guestCount = 'Guests must be between 1 and 5,000.'
  if (!Number.isInteger(p.totalBudget) || p.totalBudget < 1) errors.totalBudget = 'Enter a total budget in whole numbers.'
  return errors
}

export default function CreatePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [edits, setEdits] = useState<PlanInput | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const firstStep = useRef(true)
  // Dates and the saved draft only exist in the browser; reading them after hydration avoids mismatches.
  const hydrated = useHydrated()
  const today = hydrated ? todayIso() : ''
  const plan = edits ?? (hydrated ? restoreDraft(today) : blank)

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
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch {
      // Draft is a convenience only.
    }
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
    setStep((s) => Math.min(5, s + 1))
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
      rememberPlan({ slug, title: parsed.data.title, eventType: parsed.data.eventType, date: parsed.data.date })
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // Ignore.
      }
      router.push(`/plan/${slug}#edit=${editToken}`)
    } catch (e) {
      setFormError(errorMessage(e))
      setFailed(true)
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (step < 5) goNext()
    else void finish()
  }

  const field = (name: string) => ({
    id: `f-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `e-${name}` : undefined,
  })
  const fieldError = (name: string) =>
    errors[name] ? <span className="field-error" id={`e-${name}`}>{errors[name]}</span> : null
  const cats = categories[plan.eventType]

  return (
    <main className="wizard-page" data-event={plan.eventType}>
      <header className="plan-top">
        <Link className="brand brand-home" href="/">
          Soirée <span>New plan</span>
        </Link>
        <span className="muted" aria-hidden>
          Step {step} of 5
        </span>
      </header>
      <div className="wizard-layout">
        <form onSubmit={onSubmit} noValidate id="main">
          <ol className="stepper" aria-label={`Step ${step} of 5`}>
            {titles.map((t, i) => (
              <li key={t} data-done={i < step} />
            ))}
          </ol>
          <span className="eyebrow">Create your plan</span>
          <h1 ref={heading} tabIndex={-1}>
            {titles[step - 1]}
          </h1>

          {step === 1 && (
            <div className="choice-grid" role="group" aria-label="Event type">
              {(Object.keys(eventLabels) as EventType[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="choice event-card"
                  data-event={k}
                  aria-pressed={plan.eventType === k}
                  onClick={() => update({ eventType: k, priorities: plan.eventType === k ? plan.priorities : [] })}
                >
                  <RibbonGlow colors={ribbonColors[k]} />
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
                <input {...field('title')} maxLength={80} value={plan.title} onChange={(e) => update({ title: e.target.value })} />
                {fieldError('title')}
              </label>
              <label>
                City
                <input {...field('city')} maxLength={40} value={plan.city} onChange={(e) => update({ city: e.target.value })} />
                {fieldError('city')}
              </label>
              <fieldset className="segmented">
                <legend>City size</legend>
                <div>
                  {tiers.map((t) => (
                    <label key={t.value}>
                      <input type="radio" name="tier" checked={plan.cityTier === t.value} onChange={() => update({ cityTier: t.value })} />
                      {t.label}
                    </label>
                  ))}
                </div>
                <span className="field-hint">Smaller towns usually spend less on the venue, so more goes to your priorities.</span>
              </fieldset>
              <div className="form-row">
                <label>
                  Event date
                  <input {...field('date')} type="date" min={today || undefined} value={plan.date} onChange={(e) => update({ date: e.target.value })} />
                  {fieldError('date')}
                </label>
                <label>
                  Planning starts
                  <input {...field('planningStart')} type="date" max={plan.date || undefined} value={plan.planningStart} onChange={(e) => update({ planningStart: e.target.value })} />
                  {fieldError('planningStart')}
                </label>
              </div>
              <div className="form-row">
                <label>
                  Expected guests
                  <input {...field('guestCount')} type="number" inputMode="numeric" min={1} max={5000} value={plan.guestCount || ''} onChange={(e) => update({ guestCount: Number(e.target.value) })} />
                  {fieldError('guestCount')}
                </label>
                <label>
                  Currency
                  <select value={plan.currency} onChange={(e) => update({ currency: e.target.value as Currency })}>
                    {currencies.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Total budget
                <input {...field('totalBudget')} type="number" inputMode="numeric" min={1} value={plan.totalBudget || ''} onChange={(e) => update({ totalBudget: Number(e.target.value) })} />
                {plan.totalBudget > 0 && <span className="field-hint">{money(plan.totalBudget, plan.currency)}</span>}
                {fieldError('totalBudget')}
              </label>
            </div>
          )}

          {step === 3 && (
            <>
              <p className="muted">Pick up to three, in order. Your first pick is protected most when money gets tight.</p>
              <div className="choice-grid" role="group" aria-label="Priorities">
                {cats.map((item) => {
                  const rank = plan.priorities.indexOf(item)
                  return (
                    <button
                      key={item}
                      type="button"
                      className="choice"
                      aria-pressed={rank >= 0}
                      onClick={() =>
                        update({ priorities: rank >= 0 ? plan.priorities.filter((x) => x !== item) : [...plan.priorities, item].slice(0, 3) })
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
                <input defaultValue={plan.vibes.join(', ')} onChange={(e) => update({ vibes: splitList(e.target.value) })} placeholder="Garden, warm, playful" />
                <span className="field-hint">Up to four words, separated by commas.</span>
              </label>
              <label>
                Food needs
                <input defaultValue={plan.diet.join(', ')} onChange={(e) => update({ diet: splitList(e.target.value) })} placeholder="Vegetarian, Jain, nut-free" />
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={plan.accessibility} onChange={(e) => update({ accessibility: e.target.checked })} />
                Step-free access matters for our guests
              </label>
              <label>
                Anything else we should know?
                <textarea maxLength={600} value={plan.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} />
                <span className="field-hint">{600 - (plan.notes?.length ?? 0)} characters left</span>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="review-card">
              <h2 className="serif" style={{ margin: 0, fontSize: 26 }}>{plan.title}</h2>
              <dl>
                <dt>Event</dt>
                <dd>{eventLabels[plan.eventType]} in {plan.city}</dd>
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
              {step < 5 ? 'Continue' : busy ? 'Building your plan…' : failed ? 'Try again' : 'Generate my plan'} <ArrowRight aria-hidden />
            </button>
          </div>
        </form>

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
    </main>
  )
}
