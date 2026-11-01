import type { PlanInput } from './schemas'
import { categories } from './categories'

export { categories }

const templates: Record<string, readonly number[]> = {
  wedding: [28, 14, 23, 12, 10, 13],
  birthday: [30, 20, 18, 12, 8, 12],
  community: [20, 22, 18, 14, 10, 16],
}

/** @deprecated Will be replaced by server-side allocator in M2. */
export function buildBudget(plan: PlanInput) {
  const names = [...categories[plan.eventType], 'Buffer']
  const pct = [...(templates[plan.eventType] ?? templates['wedding'] ?? [])]
  while (pct.length < names.length) pct.push(10)
  const delta = plan.cityTier === 2 ? -2 : plan.cityTier === 3 ? -4 : 0
  if (delta) {
    const venueIdx = 2
    const lastIdx = pct.length - 1
    pct[venueIdx] = (pct[venueIdx] ?? 0) + delta
    pct[lastIdx] = (pct[lastIdx] ?? 0) - delta
  }
  const sum = pct.reduce((a, b) => a + b, 0)
  const lastIdx = pct.length - 1
  pct[lastIdx] = (pct[lastIdx] ?? 0) + 100 - sum
  return names.map((name, i) => ({
    name,
    percent: pct[i] ?? 0,
    amount: Math.round(plan.totalBudget * (pct[i] ?? 0) / 100),
    priority: plan.priorities.includes(name),
    note:
      name === 'Buffer'
        ? 'A little room for the unexpected.'
        : plan.priorities.includes(name)
          ? 'Protected because it matters most.'
          : 'A flexible line to shape as you learn more.',
  }))
}

/** @deprecated Will be replaced by server-side timeline in M2. */
export function buildTasks(plan: PlanInput) {
  const first = categories[plan.eventType][0] ?? 'Catering'
  return [
    'Confirm your guest count',
    `Shortlist two ${first.toLowerCase()} options`,
    'Choose your entertainment or music',
    'Send invitations or save-the-dates',
    `Lock the ${plan.priorities[0] ?? first} details`,
    'Review the full budget',
    'Confirm final vendor timings',
    'Enjoy the day',
  ].map((title, i) => ({
    title,
    due: i < 2 ? 'This week' : i < 4 ? 'In 2 weeks' : 'Before the event',
    done: false,
  }))
}

/** @deprecated Will be replaced by server-side vendor list in M2. */
export function buildVendors(plan: PlanInput) {
  return categories[plan.eventType].map((name, i) => ({
    name,
    status: i === 0 ? 'Shortlisting' : 'Not started',
  }))
}

/** @deprecated Will be replaced by server-side scenarios in M2. */
export function scenario(plan: PlanInput, guests: number) {
  const perGuest = plan.totalBudget * 0.28 / Math.max(1, plan.guestCount)
  const extra = Math.round((guests - plan.guestCount) * perGuest)
  const absorbedByBuffer = Math.max(0, Math.min(extra, Math.round(plan.totalBudget * 0.13 * 0.5)))
  return {
    estimate: plan.totalBudget + extra - absorbedByBuffer,
    delta: extra - absorbedByBuffer,
    absorbedByBuffer,
    overBy: Math.max(0, extra - absorbedByBuffer),
  }
}
