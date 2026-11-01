import { IdeaPatch } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { updateIdea } from '@/lib/server/services/editPlan'

export const runtime = 'nodejs'
export const maxDuration = 60

export const PATCH = withHandler(
  { name: 'plans.idea', limit: 'edit', auth: true, body: IdeaPatch },
  async ({ c, plan, params, body }) => {
    await updateIdea(c, plan, params.ideaId ?? '', body.saved)
    return null
  },
)
