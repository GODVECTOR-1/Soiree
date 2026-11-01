import type {
  BudgetLine,
  EventType,
  InputPatch,
  PlanDiff,
  PlanInput,
  Phase,
  PlanVersion,
  Task,
  VendorItem,
  WhatIfResult,
} from '../schemas'
import { addDays } from '../format'
import { allocate } from './allocate'
import { buildDiff } from './diff'
import { allTasks, toPhases } from './timeline'
import { withEstimates } from './vendors'
import { distribute, pct, sum, templateFor } from './templates'

/** A scenario with its numbers already validated. `today` is passed in so the domain stays pure. */
export type Scenario =
  | { kind: 'budget_change'; value: number }
  | { kind: 'guest_change'; guests: number }
  | { kind: 'venue_cancelled'; today: string }
  | { kind: 'date_change'; days: number; today: string }
  | { kind: 'reprioritize'; priorities: string[] }

export type ScenarioResult = WhatIfResult & { floorsBroken: boolean }

type Parts = {
  lines: BudgetLine[]
  total: number
  label: string
  patch: InputPatch
  floorsBroken?: boolean
  phases?: Phase[]
  vendors?: VendorItem[]
  narrative?: string
}

const copy = (lines: BudgetLine[]) => lines.map((l) => ({ ...l }))
const amountsOf = (lines: BudgetLine[]) => lines.map((l) => l.amount)
const flexOf = (type: EventType, l: BudgetLine) => templateFor(type, l.category)?.flex ?? ''

/** Add integer `deltas` to `lines` in place. */
function shift(lines: BudgetLine[], deltas: number[]) {
  lines.forEach((l, k) => (l.amount += deltas[k] ?? 0))
}

/** Move `diff` (positive adds, negative cuts) through non-priority lines: flexible and buffer, then semi, then fixed, floors first. */
function absorb(lines: BudgetLine[], diff: number, type: EventType, total: number) {
  const out = copy(lines)
  const open = out.filter((l) => !l.isPriority)
  if (diff > 0) {
    const takers = open.filter((l) => flexOf(type, l) === 'flexible')
    const pool = takers.length ? takers : open.length ? open : out
    shift(pool, distribute(diff, amountsOf(pool)))
    return { lines: out, floorsBroken: false }
  }
  let need = -diff
  // The buffer gives alongside flexible lines: keeping it whole while categories halve helps nobody.
  for (const tier of [['flexible', 'buffer'], ['semi'], ['fixed']]) {
    const donors = open.filter((l) => tier.includes(flexOf(type, l)))
    const room = donors.map((l) =>
      Math.max(
        0,
        l.amount - Math.round((total * (templateFor(type, l.category)?.share ?? 0)) / 200),
      ),
    )
    const take = Math.min(need, sum(room))
    shift(
      donors,
      distribute(take, room).map((x) => -x),
    )
    need -= take
  }
  const floorsBroken = need > 0
  if (floorsBroken) {
    // Floors cannot hold: cut proportionally, reaching priority lines only if nothing else is left.
    const pool = sum(amountsOf(open)) >= need ? open : out
    shift(
      pool,
      distribute(need, amountsOf(pool)).map((x) => -x),
    )
  }
  return { lines: out, floorsBroken }
}

/** Templated narrative from the numbers; the AI may rewrite it, using only these facts. */
export function templateNarrative(diff: PlanDiff, floorsBroken: boolean) {
  if (floorsBroken)
    return 'This change is bigger than the flexible lines can absorb, so every non-priority line takes a share of the cut.'
  const kept = diff.rows.filter((r) => r.protected).map((r) => r.category)
  return kept.length
    ? `Still protected: ${kept.join(', ')}. The flexible lines make room first.`
    : 'The flexible lines make room first, so your plan keeps its shape.'
}

function finish(current: PlanVersion, p: Parts): ScenarioResult {
  const lines = p.lines.map((l) => ({ ...l, sharePct: pct(l.amount, p.total) }))
  const draft = withEstimates({
    ...current,
    version: current.version + 1,
    scenario: p.label,
    budgetTotal: p.total,
    lines,
    phases: p.phases ?? current.phases,
    vendors: p.vendors ?? current.vendors,
  })
  const diff = buildDiff(current, draft)
  draft.narrative = p.narrative ?? templateNarrative(diff, p.floorsBroken ?? false)
  return { draft, diff, inputPatch: p.patch, floorsBroken: p.floorsBroken ?? false }
}

function budgetChange(input: PlanInput, current: PlanVersion, value: number): ScenarioResult {
  const total = Math.round(current.budgetTotal * (1 + value / 100))
  const label = `Budget ${value > 0 ? 'up' : 'down'} ${Math.abs(value)}%`
  const extra = total - current.budgetTotal
  const lines = copy(current.lines)
  if (extra > 0) {
    // Priorities take 60% of new money; the rest spreads by size.
    const pri = lines.filter((l) => l.isPriority)
    const rest = lines.filter((l) => !l.isPriority)
    const toPri = pri.length && rest.length ? Math.round(extra * 0.6) : pri.length ? extra : 0
    shift(pri, distribute(toPri, amountsOf(pri)))
    shift(rest, distribute(extra - toPri, amountsOf(rest)))
    return finish(current, { lines, total, label, patch: { totalBudget: total } })
  }
  const r = absorb(lines, extra, input.eventType, total)
  return finish(current, {
    lines: r.lines,
    total,
    label,
    patch: { totalBudget: total },
    floorsBroken: r.floorsBroken,
  })
}

function guestChange(input: PlanInput, current: PlanVersion, wanted: number): ScenarioResult {
  const guests = Math.min(5000, Math.max(1, Math.round(wanted)))
  const ratio = guests / input.guestCount
  const total = current.budgetTotal
  const driven = (l: BudgetLine) => {
    const t = templateFor(input.eventType, l.category)
    return t?.perGuest ? ratio : t?.flex === 'semi' ? 1 + (ratio - 1) / 2 : null
  }
  // Per-guest lines scale fully, semi lines by half; the rest absorb the difference. Total is unchanged.
  const lines = current.lines.map((l) => ({
    ...l,
    amount: Math.round(l.amount * (driven(l) ?? 1)),
  }))
  const rest = lines.filter((l) => driven(l) === null)
  const drivenSum = sum(amountsOf(lines.filter((l) => driven(l) !== null)))
  const r = absorb(rest, total - drivenSum - sum(amountsOf(rest)), input.eventType, total)
  return finish(current, {
    lines: lines.map((l) => r.lines.find((x) => x.id === l.id) ?? l),
    total,
    label: `${guests > input.guestCount ? 'Add' : 'Remove'} ${Math.abs(guests - input.guestCount)} guests`,
    patch: { guestCount: guests },
    floorsBroken: r.floorsBroken,
  })
}

const URGENT_VENUE = [
  'Ask the old venue for any refund in writing',
  'Shortlist three replacement venues for your date',
  'Tell booked vendors the venue is changing',
]

function venueCancelled(input: PlanInput, current: PlanVersion, today: string): ScenarioResult {
  const next = current.version + 1
  const lines = copy(current.lines)
  const venue = lines.find((l) => templateFor(input.eventType, l.category)?.venue)
  if (!venue)
    return finish(current, {
      lines,
      total: current.budgetTotal,
      label: 'Venue cancelled',
      patch: {},
    })
  // A short-notice premium of 15% on the venue line, absorbed by the other lines like a cut.
  const premium = Math.round(venue.amount * 0.15)
  venue.amount += premium
  const r = absorb(
    lines.filter((l) => l !== venue),
    -premium,
    input.eventType,
    current.budgetTotal,
  )
  const urgent: Task[] = URGENT_VENUE.map((title, n) => ({
    id: `venue-emergency-${n}-v${next}`,
    title,
    dueLabel: 'ASAP',
    done: false,
    tags: n === 1 ? [venue.category] : [],
  }))
  return finish(current, {
    lines: lines.map((l) => r.lines.find((x) => x.id === l.id) ?? l),
    total: current.budgetTotal,
    label: 'Venue cancelled',
    patch: {},
    floorsBroken: r.floorsBroken,
    phases: toPhases([...urgent, ...allTasks(current.phases)], input.date, today),
    // A new id: the replacement venue is a new booking, so Apply cannot restore the old "booked" status.
    vendors: current.vendors.map((v) =>
      v.category === venue.category && !v.custom
        ? {
            ...v,
            id: `vendor-${venue.id}-r${next}`,
            status: 'not_started' as const,
            notes: undefined,
            name: undefined,
            contact: undefined,
            quote: undefined,
          }
        : v,
    ),
  })
}

function dateChange(
  input: PlanInput,
  current: PlanVersion,
  days: number,
  today: string,
): ScenarioResult {
  const next = current.version + 1
  const date = addDays(input.date, days)
  const reconfirm: Task[] = current.vendors
    .filter((v) => v.status === 'booked')
    .map((v) => ({
      id: `reconfirm-${v.id}-v${next}`,
      title: `Reconfirm ${v.category.toLowerCase()} availability for the new date`,
      dueLabel: 'ASAP',
      done: false,
      tags: [v.category],
    }))
  return finish(current, {
    lines: copy(current.lines),
    total: current.budgetTotal,
    label: `Move the date ${Math.abs(days)} days ${days > 0 ? 'later' : 'earlier'}`,
    patch: { date },
    phases: toPhases([...reconfirm, ...allTasks(current.phases)], date, today),
    narrative: reconfirm.length
      ? 'Your budget stays the same. Booked vendors are asked to reconfirm the new date, and every task moves with it.'
      : 'Your budget stays the same, and every task moves with the new date.',
  })
}

/** Compute a draft version for a scenario. Numbers come from code, never from the model. */
export function runScenario(input: PlanInput, current: PlanVersion, s: Scenario): ScenarioResult {
  switch (s.kind) {
    case 'budget_change':
      return budgetChange(input, current, s.value)
    case 'guest_change':
      return guestChange(input, current, s.guests)
    case 'venue_cancelled':
      return venueCancelled(input, current, s.today)
    case 'date_change':
      return dateChange(input, current, s.days, s.today)
    case 'reprioritize':
      return finish(current, {
        lines: allocate({ ...input, priorities: s.priorities, totalBudget: current.budgetTotal }),
        total: current.budgetTotal,
        label: `New priorities: ${s.priorities.join(', ')}`,
        patch: { priorities: s.priorities },
      })
  }
}
