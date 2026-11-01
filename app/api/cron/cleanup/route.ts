import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/server/env'
import { AppError } from '@/lib/server/http/errors'
import { withHandler } from '@/lib/server/http/handler'

export const runtime = 'nodejs'
export const maxDuration = 60

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Retention cron (vercel.json): expired plans and stale rate-limit rows. Requires `Bearer CRON_SECRET`. */
export const GET = withHandler({ name: 'cron.cleanup' }, async ({ c, req }) => {
  const secret = env().CRON_SECRET
  if (!secret || !same(req.headers.get('authorization') ?? '', `Bearer ${secret}`))
    throw new AppError('CRON_UNAUTHORIZED', 401, 'Not allowed.')
  return { ok: true, deleted: await c.repo.cleanup() }
})
