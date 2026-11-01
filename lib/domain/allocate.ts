import type { BudgetLine, PlanInput } from '../schemas'
import { budgetTemplates, distribute, pct, planningUnit, slugId, sum, type LineTemplate } from './templates'

const BOOSTS = [4, 3, 2]

type AllocInput = Pick<PlanInput, 'eventType' | 'priorities' | 'totalBudget' | 'currency' | 'cityTier'>
export type LineNote = { rationale?: string; tradeoffNote?: string }

function rationale(t: LineTemplate, rank: number) {
  if (rank >= 0) return `Protected because you ranked it number ${rank + 1}.`
  if (t.flex === 'buffer') return 'Room for the unexpected. Keep it until the final week.'
  if (t.perGuest) return 'Scales with your guest list.'
  if (t.flex === 'fixed') return 'A fixed cost. Plan for it early.'
  return t.flex === 'semi' ? 'Hard to shrink once booked.' : 'Flexible. Trimmed first if the budget tightens.'
}

/** Percentage shares per template line: template, city-tier shift, then rank boosts funded above floors. */
export function baselineShares(input: AllocInput): number[] {
  const tpl = budgetTemplates[input.eventType]
  const rank = tpl.map((t) => input.priorities.indexOf(t.label))
  const shares = tpl.map((t) => t.share)
  const priorityIdx = rank.map((r, i) => (r >= 0 ? i : -1)).filter((i) => i >= 0)

  // City tier: smaller cities spend less on venue and give it to priorities.
  const venueIdx = tpl.findIndex((t) => t.venue)
  const shift = (input.cityTier - 1) * 2
  if (shift && venueIdx >= 0 && priorityIdx.length && rank[venueIdx] === -1) {
    shares[venueIdx] = (shares[venueIdx] ?? 0) - shift
    distribute(shift, priorityIdx.map(() => 1)).forEach((pts, k) => {
      const i = priorityIdx[k] ?? 0
      shares[i] = (shares[i] ?? 0) + pts
    })
  }

  // Rank boosts, funded from non-priority flexible and semi lines without breaking their floors.
  const donors = tpl.map((t, i) => (rank[i] === -1 && (t.flex === 'flexible' || t.flex === 'semi') ? i : -1)).filter((i) => i >= 0)
  const room = donors.map((i) => Math.max(0, (shares[i] ?? 0) - (tpl[i]?.share ?? 0) / 2))
  const wanted = sum(priorityIdx.map((i) => BOOSTS[rank[i] ?? 0] ?? 0))
  const scale = wanted > 0 ? Math.min(1, sum(room) / wanted) : 0
  priorityIdx.forEach((i) => (shares[i] = (shares[i] ?? 0) + (BOOSTS[rank[i] ?? 0] ?? 0) * scale))
  donors.forEach((i, k) => (shares[i] = (shares[i] ?? 0) - (sum(room) ? ((room[k] ?? 0) / sum(room)) * wanted * scale : 0)))
  return shares
}

/**
 * Turn shares into exact integer lines: rounded to a planning unit by largest remainder, odd remainder to the
 * buffer line, so lines always sum exactly to the total. `notes` override the templated rationale per line.
 */
export function toLines(input: Omit<AllocInput, 'cityTier'>, shares: number[], notes: LineNote[] = []): BudgetLine[] {
  const tpl = budgetTemplates[input.eventType]
  const unit = planningUnit(input.totalBudget, input.currency)
  const amounts = distribute(Math.floor(input.totalBudget / unit), shares).map((x) => x * unit)
  const bufferIdx = Math.max(0, tpl.findIndex((t) => t.flex === 'buffer'))
  amounts[bufferIdx] = (amounts[bufferIdx] ?? 0) + (input.totalBudget % unit)
  return tpl.map((t, i) => {
    const rank = input.priorities.indexOf(t.label)
    const amount = amounts[i] ?? 0
    return {
      id: slugId(t.label),
      category: t.label,
      amount,
      sharePct: pct(amount, input.totalBudget),
      isPriority: rank >= 0,
      rationale: notes[i]?.rationale ?? rationale(t, rank),
      tradeoffNote: notes[i]?.tradeoffNote ?? (rank < 0 && t.flex === 'flexible' ? 'Gives first when priorities need room.' : undefined),
    }
  })
}

/** Priority-aware allocation: template shares, city-tier shift, rank boosts, exact integer amounts. */
export function allocate(input: AllocInput): BudgetLine[] {
  return toLines(input, baselineShares(input))
}

/** Total check shown everywhere a budget appears. */
export function totalCheck(lines: BudgetLine[], target: number) {
  const allocated = sum(lines.map((l) => l.amount))
  return { allocated, target, ok: allocated === target }
}
