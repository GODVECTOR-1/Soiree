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

/** Field-level checks for the wizard's basics step, in plain language. Empty when everything is valid. */
export function basicsErrors(p: PlanInput, today: string): Partial<Record<BasicsField, string>> {
  const errors: Partial<Record<BasicsField, string>> = {}
  if (!p.title.trim()) errors.title = 'Give your celebration a name.'
  if (!p.city.trim()) errors.city = 'Add the city, so costs fit the place.'
  if (!p.date) errors.date = 'Pick the event date.'
  else if (p.date < today) errors.date = 'The event date must be today or later.'
  if (!p.planningStart) errors.planningStart = 'Pick when planning starts.'
  else if (p.date && p.planningStart > p.date)
    errors.planningStart = 'Planning must start on or before the event.'
  if (!Number.isInteger(p.guestCount) || p.guestCount < 1 || p.guestCount > 5000)
    errors.guestCount = 'Guests must be between 1 and 5,000.'
  if (!Number.isInteger(p.totalBudget) || p.totalBudget < 1)
    errors.totalBudget = 'Enter a total budget in whole numbers.'
  return errors
}
