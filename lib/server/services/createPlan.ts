import 'server-only'
import type { PlanInput, PlanVersion } from '@/lib/schemas'
import { previewVersion } from '@/lib/domain/baseline'
import { priorityError } from '@/lib/domain/templates'
import { buildVendors } from '@/lib/domain/vendors'
import { addDays } from '@/lib/format'
import { PLAN_TTL_DAYS } from '../constants'
import type { Container } from '../container'
import { errors } from '../http/errors'
import { hashToken, newSlug, newToken } from '../security/tokens'
import { generateIdeas, personalizeTimeline, reviewAllocation, tailorVendors } from './generate'
import { isoDay } from './shared'

/** Checks Zod cannot express: dates relative to today (one day of slack for time zones) and priority allowlists. */
export function validateNewPlan(input: PlanInput, today: string) {
  if (input.date < addDays(today, -1)) throw errors.validation('The event date must be today or later.')
  if (input.planningStart > input.date) throw errors.validation('Planning must start on or before the event date.')
  const p = priorityError(input.eventType, input.priorities)
  if (p) throw errors.validation(p)
}

const settled = <T>(r: PromiseSettledResult<T>, fallback: T) => (r.status === 'fulfilled' ? r.value : fallback)

/**
 * Generation pipeline. Phase A: allocation, then the AI review. Phase B in parallel: timeline, vendor questions,
 * ideas. Any AI failure falls back to the template for that section, so a valid plan is always created.
 */
export async function createPlan(c: Container, input: PlanInput): Promise<{ slug: string; editToken: string }> {
  const now = c.now()
  const today = isoDay(now)
  validateNewPlan(input, today)
  const base = previewVersion(input, today)

  const lines = await reviewAllocation(c, input, base.lines).catch(() => base.lines)
  const vendorsBase = buildVendors(input, lines)
  const [phases, vendors, ideas] = await Promise.allSettled([
    personalizeTimeline(c, input, today, base.phases),
    tailorVendors(c, input, vendorsBase),
    generateIdeas(c, input),
  ])

  const version: PlanVersion = {
    ...base,
    createdAt: now.toISOString(),
    lines,
    phases: settled(phases, base.phases),
    vendors: settled(vendors, vendorsBase),
    ideas: settled(ideas, base.ideas),
  }
  const slug = newSlug()
  const editToken = newToken()
  await c.repo.create({ slug, tokenHash: hashToken(editToken), input, version, expiresAt: new Date(now.getTime() + PLAN_TTL_DAYS * 86400_000) })
  return { slug, editToken }
}
