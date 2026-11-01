'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { LoadingScreen } from '@/components/loading-screen'
import { BasicsStep } from '@/components/wizard/basics-step'
import {
  EventStep,
  PrioritiesStep,
  StyleStep,
  type StepProps,
} from '@/components/wizard/choice-steps'
import { ReviewStep, WizardSummary } from '@/components/wizard/plan-summary'
import { useWizardDraft } from '@/hooks/useWizardDraft'
import { useCreatePlan } from '@/hooks/useCreatePlan'
import { stepProblems, type BasicsErrors } from '@/lib/plan-form'

const titles = [
  'What are you celebrating?',
  'The basics',
  'What matters most?',
  'Style and needs',
  'Review your plan',
]
const STEPS = titles.length
const buildingSteps = [
  'Balancing the budget around your priorities',
  'Laying out a timeline that fits your date',
  'Writing questions to ask each vendor',
  'Gathering ideas that feel like you',
  'Checking every number adds up',
]

type BodyProps = StepProps & { step: number; errors: BasicsErrors; today: string }

function StepBody({ step, errors, today, ...props }: BodyProps) {
  switch (step) {
    case 1:
      return <EventStep {...props} />
    case 2:
      return <BasicsStep {...props} errors={errors} today={today} />
    case 3:
      return <PrioritiesStep {...props} />
    case 4:
      return <StyleStep {...props} />
    default:
      return <ReviewStep plan={props.plan} />
  }
}

function submitLabel(step: number, busy: boolean, failed: boolean) {
  if (step < STEPS) return 'Continue'
  if (busy) return 'Building your plan…'
  return failed ? 'Try again' : 'Generate my plan'
}

/** Moves focus to the step heading whenever the step changes (not on first load), so screen readers follow. */
function useFocusOnStep(step: number) {
  const heading = useRef<HTMLHeadingElement>(null)
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) firstStep.current = false
    else heading.current?.focus()
  }, [step])
  return heading
}

/** The five-step wizard: event, basics, priorities, style, review. */
export default function CreatePage() {
  const { plan, today, update, clear } = useWizardDraft()
  const { busy, failed, error: createError, create } = useCreatePlan(clear)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<BasicsErrors>({})
  const [stepError, setStepError] = useState('')
  const heading = useFocusOnStep(step)
  const formError = stepError || createError

  const goNext = () => {
    const { fields, message } = stepProblems(step, plan, today)
    setErrors(fields)
    setStepError(message)
    const firstInvalid = Object.keys(fields)[0]
    if (firstInvalid) document.getElementById(`f-${firstInvalid}`)?.focus()
    else if (!message) setStep((s) => Math.min(STEPS, s + 1))
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (step < STEPS) goNext()
    else void create(plan)
  }

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
            <StepBody step={step} plan={plan} update={update} errors={errors} today={today} />
            {busy && <LoadingScreen title="Building your plan" steps={buildingSteps} />}
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
                {submitLabel(step, busy, failed)} <ArrowRight aria-hidden />
              </button>
            </div>
          </form>
        </main>
        <WizardSummary plan={plan} />
      </div>
    </div>
  )
}
