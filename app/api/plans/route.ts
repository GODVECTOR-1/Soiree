import { PlanInput } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { createPlan } from '@/lib/server/services/createPlan'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Create a plan. The edit token is returned here once and never again. */
export const POST = withHandler({ name: 'plans.create', limit: 'create', body: PlanInput }, async ({ c, body }) =>
  Response.json(await createPlan(c, body), { status: 201 }),
)
