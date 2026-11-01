import type { Currency, EventType } from '../schemas'
import { categories } from '../categories'

/** How a budget line behaves when money moves: flexible gives first, fixed gives last, buffer absorbs surprises. */
type Flex = 'fixed' | 'semi' | 'flexible' | 'buffer'
export type LineTemplate = {
  label: string
  share: number
  flex: Flex
  perGuest?: boolean
  venue?: boolean
  vendor?: false
}

/** Neutral default shares per event type. Labels equal `lib/categories.ts` (+ Buffer). Each sums to 100. */
export const budgetTemplates: Record<EventType, LineTemplate[]> = {
  wedding: [
    { label: 'Catering', share: 28, flex: 'flexible', perGuest: true },
    { label: 'Photo and video', share: 14, flex: 'semi' },
    { label: 'Venue and rentals', share: 23, flex: 'semi', venue: true },
    { label: 'Music and sound', share: 12, flex: 'flexible' },
    { label: 'Decor and flowers', share: 10, flex: 'flexible' },
    { label: 'Buffer', share: 13, flex: 'buffer', vendor: false },
  ],
  birthday: [
    { label: 'Food and cake', share: 30, flex: 'flexible', perGuest: true },
    { label: 'Entertainment', share: 20, flex: 'flexible' },
    { label: 'Venue', share: 18, flex: 'semi', venue: true },
    { label: 'Decor', share: 12, flex: 'flexible' },
    { label: 'Return gifts', share: 8, flex: 'flexible', perGuest: true },
    { label: 'Buffer', share: 12, flex: 'buffer', vendor: false },
  ],
  community: [
    { label: 'Promotion and reach', share: 20, flex: 'flexible' },
    { label: 'Food', share: 22, flex: 'flexible', perGuest: true },
    { label: 'Sound and stage', share: 18, flex: 'semi' },
    { label: 'Volunteers', share: 14, flex: 'flexible', vendor: false },
    { label: 'Permits', share: 10, flex: 'fixed', vendor: false },
    { label: 'Contingency reserve', share: 16, flex: 'buffer', vendor: false },
  ],
}

/** Sum of a list of numbers. */
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Percentage with one decimal; 0 when the total is 0. */
export const pct = (amount: number, total: number) =>
  total > 0 ? Math.round((amount / total) * 1000) / 10 : 0

/** Stable, URL-safe id from a label ("Photo and video" -> "photo-and-video"). */
export const slugId = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** The template line for a category, if any. */
export const templateFor = (type: EventType, label: string) =>
  budgetTemplates[type].find((t) => t.label === label)

/** Lowest share (percent points) a line may fall to before floors are "broken": half its default. */
export const floorShare = (t: LineTemplate) => t.share / 2

/** Amounts round to a unit so lines read like a plan, not a calculation (INR 100, others 10, 1 for tiny budgets). */
export function planningUnit(total: number, currency: Currency) {
  if (total < 2000) return 1
  return currency === 'INR' ? 100 : 10
}

/** Split `amount` into integers proportional to `weights` that add up exactly (largest remainder). */
export function distribute(amount: number, weights: number[]): number[] {
  const w = sum(weights) > 0 ? weights : weights.map(() => 1)
  const raw = w.map((x) => (amount * x) / sum(w))
  const out = raw.map(Math.floor)
  let left = amount - sum(out)
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem)
  for (const { i } of order) {
    if (left <= 0) break
    out[i] = (out[i] ?? 0) + 1
    left--
  }
  return out
}

/** Plain-language problem with a priority list, or null when it is valid for the event type. */
export function priorityError(eventType: EventType, priorities: string[]): string | null {
  if (priorities.length < 1 || priorities.length > 3) return 'Choose one to three priorities.'
  if (new Set(priorities).size !== priorities.length) return 'Each priority can be chosen once.'
  const allowed = categories[eventType]
  if (priorities.some((p) => !allowed.includes(p)))
    return 'One of the priorities does not fit this event type.'
  return null
}
