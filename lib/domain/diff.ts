import type { PlanDiff, PlanVersion } from '../schemas'
import { totalCheck } from './allocate'
import { allTasks } from './timeline'

/**
 * Before/after rows per category. A row is `protected` when the line is a priority in the draft and was not reduced.
 * `impactedTasks` lists open tasks tagged with a category that moved more than 10%.
 */
export function buildDiff(current: PlanVersion, draft: PlanVersion): PlanDiff {
  const rows = current.lines.map((before) => {
    const next = draft.lines.find((l) => l.id === before.id)
    const after = next?.amount ?? 0
    return {
      category: before.category,
      before: before.amount,
      after,
      deltaPct: before.amount ? Math.round(((after - before.amount) / before.amount) * 100) : 0,
      protected: (next?.isPriority ?? false) && after >= before.amount,
    }
  })
  const moved = new Set(rows.filter((r) => Math.abs(r.deltaPct) > 10).map((r) => r.category))
  return {
    fromVersion: current.version,
    toVersion: draft.version,
    budgetFrom: current.budgetTotal,
    budgetTo: draft.budgetTotal,
    rows,
    impactedTasks: allTasks(current.phases).filter((t) => !t.done && t.tags?.some((tag) => moved.has(tag))).map((t) => t.title),
    totalCheck: totalCheck(draft.lines, draft.budgetTotal),
  }
}
