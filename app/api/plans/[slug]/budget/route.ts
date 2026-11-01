import { BudgetPatch } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { saveBudget } from '@/lib/server/services/editPlan'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Manual allocation; must add up to the budget exactly. Returns the updated version. */
export const PATCH = withHandler(
  { name: 'plans.budget', limit: 'edit', auth: true, body: BudgetPatch },
  ({ c, plan, body }) => saveBudget(c, plan, body.amounts),
)
