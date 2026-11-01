'use client'

import type { Currency } from '@/lib/schemas'
import type { BasicsErrors, BasicsField } from '@/lib/plan-form'
import { money } from '@/lib/format'
import type { StepProps } from '@/components/wizard/choice-steps'

const tiers = [
  { value: 1, label: 'Metro' },
  { value: 2, label: 'Large city' },
  { value: 3, label: 'Smaller town' },
] as const
const currencies: Currency[] = ['INR', 'USD', 'EUR', 'GBP']

type BasicsProps = StepProps & { errors: BasicsErrors; today: string }

/** Id, validity and description wiring for a basics field; `hint` links its help text too. */
function fieldProps(errors: BasicsErrors, name: BasicsField, hint = false) {
  const describedBy = [hint && `h-${name}`, errors[name] && `e-${name}`].filter(Boolean).join(' ')
  return {
    id: `f-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': describedBy || undefined,
  }
}

function FieldError({ errors, name }: { errors: BasicsErrors; name: BasicsField }) {
  if (!errors[name]) return null
  return (
    <span className="field-error" id={`e-${name}`}>
      {errors[name]}
    </span>
  )
}

/** Name, city and city size. */
function PlaceFields({ plan, update, errors }: BasicsProps) {
  return (
    <>
      <label>
        Celebration name
        <input
          {...fieldProps(errors, 'title')}
          maxLength={80}
          autoComplete="off"
          value={plan.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <FieldError errors={errors} name="title" />
      </label>
      <label>
        City
        <input
          {...fieldProps(errors, 'city')}
          maxLength={40}
          autoComplete="address-level2"
          value={plan.city}
          onChange={(e) => update({ city: e.target.value })}
        />
        <FieldError errors={errors} name="city" />
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
    </>
  )
}

/** Event date and when planning starts. */
function DateFields({ plan, update, errors, today }: BasicsProps) {
  return (
    <div className="form-row">
      <label>
        Event date
        <input
          {...fieldProps(errors, 'date')}
          type="date"
          min={today || undefined}
          value={plan.date}
          onChange={(e) => update({ date: e.target.value })}
        />
        <FieldError errors={errors} name="date" />
      </label>
      <label>
        Planning starts
        <input
          {...fieldProps(errors, 'planningStart')}
          type="date"
          max={plan.date || undefined}
          value={plan.planningStart}
          onChange={(e) => update({ planningStart: e.target.value })}
        />
        <FieldError errors={errors} name="planningStart" />
      </label>
    </div>
  )
}

/** Guests, currency and the total budget (shown back formatted as it is typed). */
function SizeFields({ plan, update, errors }: BasicsProps) {
  return (
    <>
      <div className="form-row">
        <label>
          Expected guests
          <input
            {...fieldProps(errors, 'guestCount')}
            type="number"
            inputMode="numeric"
            min={1}
            max={5000}
            value={plan.guestCount || ''}
            onChange={(e) => update({ guestCount: Number(e.target.value) })}
          />
          <FieldError errors={errors} name="guestCount" />
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
          {...fieldProps(errors, 'totalBudget', plan.totalBudget > 0)}
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
        <FieldError errors={errors} name="totalBudget" />
      </label>
    </>
  )
}

/** Step 2: the facts every number in the plan depends on. Errors are tied to their fields. */
export function BasicsStep(props: BasicsProps) {
  return (
    <div className="form-stack">
      <PlaceFields {...props} />
      <DateFields {...props} />
      <SizeFields {...props} />
    </div>
  )
}
