import { ScenarioInput } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { discardDraft, runWhatIf } from '@/lib/server/services/runWhatIf'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Compute a scenario draft (replacing any previous draft). */
export const POST = withHandler({ name: 'plans.whatif', limit: 'whatif', auth: true, body: ScenarioInput }, ({ c, plan, body }) =>
  runWhatIf(c, plan, body),
)

/** Discard the draft. Idempotent. */
export const DELETE = withHandler({ name: 'plans.whatif.discard', limit: 'edit', auth: true }, async ({ c, plan }) => {
  await discardDraft(c, plan)
  return null
})
