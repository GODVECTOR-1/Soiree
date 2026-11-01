import 'server-only'
import { Plan, PlanVersion } from '@/lib/schemas'
import type { Container } from '../container'
import type { PlanRecord } from '../db/planRepository'
import { errors } from '../http/errors'

/** Today's date (UTC) as YYYY-MM-DD. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Re-read a plan after a compare-and-set miss; 404 if it vanished or expired meanwhile. */
export async function reload(c: Container, slug: string): Promise<PlanRecord> {
  const fresh = await c.repo.get(slug)
  if (!fresh) throw errors.notFound()
  return fresh
}

/** The public shape: no token hash, no internal revision, never a draft. */
export const toPublicPlan = (r: PlanRecord, readOnly = false): Plan =>
  Plan.parse({ slug: r.slug, input: r.input, current: PlanVersion.parse(r.current), history: r.history, readOnly })

/** The weak ETag for a plan's current state. */
export const etagOf = (r: PlanRecord) => `W/"${r.current.version}-${r.current.rev}"`
