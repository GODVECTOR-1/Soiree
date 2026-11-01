import { ApplyRequest } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { applyVersion } from '@/lib/server/services/applyVersion'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Apply a draft, keeping progress made while it was open. Idempotent. */
export const POST = withHandler(
  { name: 'plans.apply', limit: 'edit', auth: true, body: ApplyRequest },
  ({ c, plan, body }) => applyVersion(c, plan, body.version),
)
