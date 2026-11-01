import type { BudgetLine, PlanInput, PlanVersion, VendorItem, VendorPatch } from '../schemas'
import { pct, templateFor } from './templates'

/** Template questions per category, used when no personalized questions are available. */
export const vendorQuestions: Record<string, string[]> = {
  Catering: ['What is included per plate, and what costs extra?', 'When do you need the final guest count?', 'Can we do a tasting before booking?'],
  'Photo and video': ['How many hours of coverage, and how many edited photos?', 'When will we receive the final files?', 'Who covers if the lead photographer is unwell?'],
  'Venue and rentals': ['What is the capacity, and is there step-free access?', 'What are the curfew and noise rules?', 'What is the cancellation policy?'],
  'Music and sound': ['Is sound equipment included?', 'How long is each set, and what happens in breaks?', 'What power do you need from the venue?'],
  'Decor and flowers': ['Which flowers are in season on our date?', 'Are setup and teardown included?', 'Can pieces be reused between ceremony and dinner?'],
  'Food and cake': ['What is the per-head price at our guest count?', 'Can you handle dietary needs?', 'When must the order be final?'],
  Entertainment: ['How long is the performance?', 'What space and power do you need?', 'Which age range does it suit best?'],
  Venue: ['What is the capacity and the minimum spend?', 'Is outside decor allowed?', 'What is the cancellation policy?'],
  Decor: ['What is included in the package?', 'Are setup and cleanup included?'],
  'Return gifts': ['What is the lead time for our quantity?', 'Can the gifts be personalized?'],
  'Promotion and reach': ['What does the print run cost at our quantity?', 'How fast can you turn around a design change?'],
  Food: ['Can you serve vegetarian and allergy-safe options?', 'What do you need for power and water?', 'How many people can you serve per hour?'],
  'Sound and stage': ['Does the price include setup, an operator, and teardown?', 'What permits or power do you need from us?'],
}

const range = (amount: number) => ({ estLow: Math.round(amount * 0.85), estHigh: Math.round(amount * 1.15) })

/** One checklist item per vendor-backed budget line. Estimates are planning ranges, not quotes. */
export function buildVendors(input: PlanInput, lines: BudgetLine[]): VendorItem[] {
  return lines
    .filter((l) => templateFor(input.eventType, l.category)?.vendor !== false)
    .map((l) => ({
      id: `vendor-${l.id}`,
      category: l.category,
      status: 'not_started' as const,
      ...range(l.amount),
      questionsToAsk: vendorQuestions[l.category] ?? [],
      verifyBeforeDeposit: true,
    }))
}

/** Most vendors a user can add to one plan. */
export const MAX_CUSTOM_VENDORS = 20

/** Apply a whitelisted edit. Empty strings clear text fields; a `null` quote clears the quote. */
export function patchVendor(v: VendorItem, patch: VendorPatch): VendorItem {
  const next: VendorItem = { ...v }
  if (patch.status) next.status = patch.status
  for (const key of ['notes', 'name', 'contact'] as const) {
    const value = patch[key]
    if (value !== undefined) next[key] = value || undefined
  }
  if (patch.quote !== undefined) next.quote = patch.quote ?? undefined
  return next
}

/**
 * A vendor the user adds (say, a second caterer to compare). It borrows the planning range and questions of the
 * budget line with the same category, if there is one. Ids are deterministic so client and server agree.
 */
export function customVendor(v: PlanVersion, category: string, name?: string): VendorItem {
  const used = v.vendors.map((x) => Number(/^custom-(\d+)$/.exec(x.id)?.[1] ?? 0))
  const line = v.lines.find((l) => l.category === category)
  return {
    id: `custom-${Math.max(0, ...used) + 1}`,
    category,
    status: 'not_started',
    ...(line ? range(line.amount) : { estLow: 0, estHigh: 0 }),
    questionsToAsk: vendorQuestions[category] ?? [],
    verifyBeforeDeposit: true,
    custom: true,
    ...(name && { name }),
  }
}

/** How a recorded quote compares with the planning range, or null when there is nothing to compare. */
export function quoteCheck(v: VendorItem): 'over' | 'under' | 'within' | null {
  if (v.quote === undefined || v.estHigh === 0) return null
  return v.quote > v.estHigh ? 'over' : v.quote < v.estLow ? 'under' : 'within'
}

/** Re-derive vendor estimate ranges and share percentages after budget lines change. */
export function withEstimates(v: PlanVersion): PlanVersion {
  const lines = v.lines.map((l) => ({ ...l, sharePct: pct(l.amount, v.budgetTotal) }))
  const vendors = v.vendors.map((vendor) => {
    const line = lines.find((l) => l.category === vendor.category)
    return line ? { ...vendor, ...range(line.amount) } : vendor
  })
  return { ...v, lines, vendors }
}
