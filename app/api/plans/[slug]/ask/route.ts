import { AskRequest } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { askPlanner } from '@/lib/server/services/askPlanner'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Grounded questions about the plan. */
export const POST = withHandler(
  { name: 'plans.ask', limit: 'ask', auth: true, body: AskRequest },
  ({ c, plan, body }) => askPlanner(c, plan, body),
)
