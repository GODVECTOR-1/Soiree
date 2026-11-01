import { setContainer, type Container } from '@/lib/server/container'
import { MemoryRepository } from '@/lib/server/db/memoryRepository'
import { FakeAi, type FakeHandler } from '@/lib/server/ai/fake'
import type { AiTask } from '@/lib/server/constants'
import { samples, type PlanInput } from '@/lib/schemas'

export const NOW = new Date('2026-11-01T10:00:00Z')

/** A fresh in-memory container with a controllable clock, installed for route handlers. */
export function testContainer(opts: { ai?: Partial<Record<AiTask, FakeHandler>>; rateLimit?: boolean } = {}) {
  let now = NOW
  const ai = new FakeAi(opts.ai)
  const repo = new MemoryRepository(() => now)
  const c: Container = { repo, ai, now: () => now, salt: 'test-salt', rateLimit: opts.rateLimit ?? true }
  setContainer(c)
  return { c, ai, repo, setNow: (d: Date) => (now = d) }
}

/** A valid plan input dated after NOW. */
export const input = (patch: Partial<PlanInput> = {}): PlanInput => ({ ...samples.wedding, planningStart: '2026-11-01', ...patch })

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
type CallOpts = { body?: unknown; raw?: string; token?: string; headers?: Record<string, string>; params?: Record<string, string> }

/** Call a route handler directly, the way Next does. */
export async function call(handler: Handler, method: string, opts: CallOpts = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  if (opts.body !== undefined || opts.raw !== undefined) headers['content-type'] ??= 'application/json'
  if (opts.token) headers['x-edit-token'] = opts.token
  const req = new Request('http://localhost/api/test', {
    method,
    headers,
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  })
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) })
  const text = await res.text()
  return { status: res.status, headers: res.headers, json: text ? (JSON.parse(text) as Record<string, unknown> & unknown[]) : null }
}
