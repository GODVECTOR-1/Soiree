import { RegenerateRequest } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { regenerateIdeas } from '@/lib/server/services/regenerateIdeas'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Fresh ideas; saved ideas are kept. */
export const POST = withHandler(
  { name: 'plans.ideas.regenerate', limit: 'regenerate', auth: true, body: RegenerateRequest },
  ({ c, plan, body }) => regenerateIdeas(c, plan, body.feedback),
)
