import { z } from 'zod'
import { PlanInput } from './schemas'

/** The most priorities a plan can rank. */
export const MAX_PRIORITIES = 3

/** An empty wizard draft. */
export const blankInput: PlanInput = {
  eventType: 'wedding',
  title: '',
  city: '',
  date: '',
  planningStart: '',
  guestCount: 0,
  cityTier: 1,
  currency: 'INR',
  totalBudget: 0,
  priorities: [],
  vibes: [],
  diet: [],
  accessibility: false,
  notes: '',
}

/** A wizard draft in progress: the plan's shape, with the fields the user has not finished allowed to be empty. */
const Draft = PlanInput.extend({
  title: z.string().max(80),
  city: z.string().max(40),
  date: z.string(),
  planningStart: z.string(),
  guestCount: z.number(),
  totalBudget: z.number(),
  priorities: z.array(z.string().max(40)).max(MAX_PRIORITIES),
})

/** Reads a saved draft (JSON); anything unreadable or malformed gives a fresh draft starting today. */
export function parseDraft(raw: string | null, today: string): PlanInput {
  try {
    const saved = Draft.safeParse(JSON.parse(raw ?? 'null'))
    if (saved.success) return saved.data
  } catch {
    // Not JSON: fall through to a fresh draft.
  }
  return { ...blankInput, planningStart: today }
}

/** "Garden, warm ,, playful" → ['Garden', 'warm', 'playful']: up to four trimmed words of up to 30 characters. */
export const splitList = (value: string) =>
  value
    .split(',')
    .map((x) => x.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 4)

/** Adds a priority at the end of the ranking, or removes it if already ranked. Ignores additions past the limit. */
export function togglePriority(priorities: readonly string[], item: string): string[] {
  if (priorities.includes(item)) return priorities.filter((x) => x !== item)
  return priorities.length < MAX_PRIORITIES ? [...priorities, item] : [...priorities]
}

export type BasicsField = 'title' | 'city' | 'date' | 'planningStart' | 'guestCount' | 'totalBudget'

type Check = (p: PlanInput, today: string) => string | undefined

const wholeBetween = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max

function dateError(p: PlanInput, today: string) {
  if (!p.date) return 'Pick the event date.'
  if (p.date < today) return 'The event date must be today or later.'
}

function planningStartError(p: PlanInput) {
  if (!p.planningStart) return 'Pick when planning starts.'
  if (p.date && p.planningStart > p.date) return 'Planning must start on or before the event.'
}

/** One check per basics field, in form order (the first field with an error gets focus). */
const basicsChecks: [BasicsField, Check][] = [
  ['title', (p) => (p.title.trim() ? undefined : 'Give your celebration a name.')],
  ['city', (p) => (p.city.trim() ? undefined : 'Add the city, so costs fit the place.')],
  ['date', dateError],
  ['planningStart', planningStartError],
  [
    'guestCount',
    (p) =>
      wholeBetween(p.guestCount, 1, 5000) ? undefined : 'Guests must be between 1 and 5,000.',
  ],
  [
    'totalBudget',
    (p) =>
      wholeBetween(p.totalBudget, 1, Infinity)
        ? undefined
        : 'Enter a total budget in whole numbers.',
  ],
]

/** Field-level checks for the wizard's basics step, in plain language. Empty when everything is valid. */
export function basicsErrors(p: PlanInput, today: string): BasicsErrors {
  const errors: BasicsErrors = {}
  for (const [field, check] of basicsChecks) {
    const message = check(p, today)
    if (message) errors[field] = message
  }
  return errors
}

export type BasicsErrors = Partial<Record<BasicsField, string>>

/**
 * What stops the wizard leaving `step`: field errors on the basics (step 2), or a message when no priority is picked
 * (step 3). Both empty means the step is complete.
 */
export function stepProblems(step: number, plan: PlanInput, today: string) {
  const fields: BasicsErrors = step === 2 ? basicsErrors(plan, today) : {}
  const message = step === 3 && !plan.priorities.length ? 'Choose at least one priority.' : ''
  return { fields, message }
}
