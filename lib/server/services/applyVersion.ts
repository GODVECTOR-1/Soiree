import 'server-only'
import type { Plan } from '@/lib/schemas'
import { mergeProgress } from '@/lib/domain/actions'
import { CAS_RETRIES } from '../constants'
import type { Container } from '../container'
import type { PlanRecord } from '../db/planRepository'
import { AppError, errors } from '../http/errors'
import { reload, toPublicPlan } from './shared'

const draftGone = () =>
  new AppError('DRAFT_NOT_FOUND', 404, 'That draft is no longer available. Run the scenario again.')

/**
 * Promote a draft. Progress made on the current version while the draft was open is merged in by id, then
 * `apply_version` swaps it in atomically. `stale` means an edit landed after the merge: re-merge and retry, then 409.
 */
export async function applyVersion(c: Container, plan: PlanRecord, version: number): Promise<Plan> {
  let p = plan
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    if (p.current.version === version) return toPublicPlan(p)
    const draft = await c.repo.getDraft(p.id, version)
    if (!draft) throw draftGone()
    const merged = mergeProgress(p.current, draft.version)
    const outcome = await c.repo.applyVersion(p.id, version, p.current.rev, {
      phases: merged.phases,
      vendors: merged.vendors,
      ideas: merged.ideas,
    })
    if (outcome === 'no_draft') throw draftGone()
    p = await reload(c, p.slug)
    if (outcome !== 'stale') return toPublicPlan(p)
  }
  throw errors.conflict()
}
