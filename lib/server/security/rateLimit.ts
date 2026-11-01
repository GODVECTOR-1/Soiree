import 'server-only'
import {
  IP_LIMITS,
  IP_WINDOW_SEC,
  PLAN_QUOTAS,
  QUOTA_EPOCH,
  type IpLimitKey,
  type PlanQuotaKey,
} from '../constants'
import type { Container } from '../container'
import { errors } from '../http/errors'

/** Fixed-window per-IP limit (per hour). Throws 429 with the seconds left in the window. */
export async function limitIp(c: Container, key: IpLimitKey, ip: string) {
  if (!c.rateLimit) return
  const now = c.now().getTime()
  const windowMs = IP_WINDOW_SEC * 1000
  const start = Math.floor(now / windowMs) * windowMs
  const count = await c.repo.incrementRate(`ip:${ip}:${key}`, new Date(start))
  if (count > IP_LIMITS[key])
    throw errors.rateLimited(Math.max(1, Math.ceil((start + windowMs - now) / 1000)))
}

const quotaNames: Record<PlanQuotaKey, string> = {
  whatif: 'scenarios',
  regenerate: 'idea refreshes',
  ask: 'questions',
}

/** Lifetime per-plan quota (fixed epoch window). Throws 429 once the plan has used it up. */
export async function spendQuota(c: Container, planId: string, key: PlanQuotaKey) {
  if (!c.rateLimit) return
  const count = await c.repo.incrementRate(`plan:${planId}:${key}`, QUOTA_EPOCH)
  if (count > PLAN_QUOTAS[key]) throw errors.quota(quotaNames[key])
}
