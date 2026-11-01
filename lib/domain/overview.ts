import type { Idea, PlanInput, PlanVersion, Task, VendorItem } from '../schemas'
import { allTasks, taskPriority } from './timeline'
import { quoteCheck } from './vendors'

const RANK = { high: 0, medium: 1, low: 2 } as const

/** Open tasks to do first: high priority (due now, a ranked priority, a guest need), then calendar order. */
export function nextTasks(version: PlanVersion, input: PlanInput, count = 4): Task[] {
  return allTasks(version.phases)
    .filter((t) => !t.done)
    .map((task, order) => ({ task, order, rank: RANK[taskPriority(task, input).level] }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, count)
    .map((x) => x.task)
}

/**
 * Vendor progress at a glance: how many are booked or in progress, which quotes are over the planning range, and
 * the next unbooked vendors to compare (ranked priorities first).
 */
export function vendorProgress(version: PlanVersion, input: PlanInput, count = 2) {
  const { vendors } = version
  const priorityRank = (v: VendorItem) => {
    const rank = input.priorities.indexOf(v.category)
    return rank < 0 ? input.priorities.length : rank
  }
  return {
    total: vendors.length,
    booked: vendors.filter((v) => v.status === 'booked').length,
    moving: vendors.filter((v) => v.status === 'shortlisting' || v.status === 'quote_received')
      .length,
    overQuotes: vendors.filter((v) => quoteCheck(v) === 'over'),
    next: vendors
      .filter((v) => v.status !== 'booked')
      .sort((a, b) => priorityRank(a) - priorityRank(b))
      .slice(0, count),
  }
}

/** Ideas with the saved ones first. */
export const savedFirst = (ideas: Idea[]): Idea[] =>
  [...ideas].sort((a, b) => Number(b.saved) - Number(a.saved))
