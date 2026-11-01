import 'server-only'
import { samples, type EventType, type Plan } from '@/lib/schemas'
import { previewVersion } from '@/lib/domain/baseline'
import { addDays } from '@/lib/format'
import { DEMO_DAYS_OUT } from '../constants'
import type { Container } from '../container'
import { errors } from '../http/errors'
import { etagOf, isoDay, toPublicPlan } from './shared'

const DEMO = /^demo-(wedding|birthday|community)$/

/** Demo plans are generated from the samples on read, dated from today so they never go stale. Never stored. */
export function demoPlan(type: EventType, today: string): Plan {
  const input = { ...samples[type], planningStart: today, date: addDays(today, DEMO_DAYS_OUT[type]) }
  const current = previewVersion(input, today)
  return { slug: `demo-${type}`, input, current, history: [{ version: 1, createdAt: today }], readOnly: true }
}

/** A plan's current version and history, with its ETag. Expired or unknown slugs are 404. */
export async function getPlan(c: Container, slug: string): Promise<{ plan: Plan; etag: string }> {
  const today = isoDay(c.now())
  const demo = DEMO.exec(slug)?.[1] as EventType | undefined
  if (demo) return { plan: demoPlan(demo, today), etag: `W/"demo-${today}"` }
  const record = await c.repo.get(slug)
  if (!record) throw errors.notFound()
  return { plan: toPublicPlan(record), etag: etagOf(record) }
}
