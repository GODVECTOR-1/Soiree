import { beforeEach, describe, expect, it } from 'vitest'
import { POST as create } from '@/app/api/plans/route'
import { GET as read } from '@/app/api/plans/[slug]/route'
import { DELETE as discard, POST as whatif } from '@/app/api/plans/[slug]/whatif/route'
import { POST as apply } from '@/app/api/plans/[slug]/apply/route'
import { PATCH as task } from '@/app/api/plans/[slug]/tasks/[taskId]/route'
import { DELETE as removeVendor, PATCH as vendor } from '@/app/api/plans/[slug]/vendors/[vendorId]/route'
import { POST as addVendor } from '@/app/api/plans/[slug]/vendors/route'
import { PATCH as idea } from '@/app/api/plans/[slug]/ideas/[ideaId]/route'
import { POST as regenerate } from '@/app/api/plans/[slug]/ideas/regenerate/route'
import { PATCH as budget } from '@/app/api/plans/[slug]/budget/route'
import { POST as ask } from '@/app/api/plans/[slug]/ask/route'
import { GET as health } from '@/app/api/health/route'
import { GET as cleanup } from '@/app/api/cron/cleanup/route'
import { ApiErrorBody, AskResponse, Idea, Plan, PlanVersion } from '@/lib/schemas'
import { call, input, NOW, testContainer } from '../helpers'

let t: ReturnType<typeof testContainer>
let slug = ''
let token = ''
const p = (extra: Record<string, string> = {}) => ({ params: { slug, ...extra }, token })
const code = (json: unknown) => ApiErrorBody.parse(json).error.code

beforeEach(async () => {
  t = testContainer()
  const res = await call(create, 'POST', { body: input() })
  ;({ slug, editToken: token } = res.json as unknown as { slug: string; editToken: string })
})

describe('POST /api/plans', () => {
  it('returns 201 with a 12-char slug and a token, 400 on bad input', async () => {
    expect(slug).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(token.length).toBeGreaterThanOrEqual(43)
    const bad = await call(create, 'POST', { body: { ...input(), guestCount: 0 } })
    expect(bad.status).toBe(400)
    expect(ApiErrorBody.parse(bad.json).error.message).toMatch(/guestCount/)
    expect((await call(create, 'POST', { raw: '{oops' })).status).toBe(400)
  })

  it('rejects bodies over 16 KB (413) and non-JSON content types (415)', async () => {
    expect((await call(create, 'POST', { raw: JSON.stringify({ notes: 'x'.repeat(17_000) }) })).status).toBe(413)
    expect((await call(create, 'POST', { raw: 'a=b', headers: { 'content-type': 'text/plain' } })).status).toBe(415)
  })

  it('rate-limits creation per IP with Retry-After', async () => {
    for (let i = 0; i < 7; i++) await call(create, 'POST', { body: input() })
    const limited = await call(create, 'POST', { body: input() })
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(ApiErrorBody.parse(limited.json).error.retryAfterSec).toBe(Number(limited.headers.get('retry-after')))
    // A different client IP has its own bucket.
    expect((await call(create, 'POST', { body: input(), headers: { 'x-real-ip': '203.0.113.9' } })).status).toBe(201)
  })
})

describe('GET /api/plans/:slug', () => {
  it('returns the plan with an ETag, 304 on match, 404 when unknown or expired', async () => {
    const res = await call(read, 'GET', { params: { slug } })
    expect(Plan.parse(res.json).current.version).toBe(1)
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    const etag = res.headers.get('etag') ?? ''
    expect(etag).toBe('W/"1-1"')
    expect((await call(read, 'GET', { params: { slug }, headers: { 'if-none-match': etag } })).status).toBe(304)
    expect((await call(read, 'GET', { params: { slug: 'nope' } })).status).toBe(404)
    t.setNow(new Date(NOW.getTime() + 91 * 86400_000))
    expect((await call(read, 'GET', { params: { slug } })).status).toBe(404)
  })

  it('serves demo plans read-only and never returns drafts', async () => {
    expect(Plan.parse((await call(read, 'GET', { params: { slug: 'demo-wedding' } })).json).readOnly).toBe(true)
    await call(whatif, 'POST', { ...p(), body: { kind: 'budget_change', value: -20 } })
    expect(Plan.parse((await call(read, 'GET', { params: { slug } })).json).current.version).toBe(1)
  })
})

describe('auth on writes', () => {
  it('401 without or with a wrong token, 403 on demo plans, 404 on unknown plans', async () => {
    const body = { kind: 'budget_change', value: -20 }
    expect(code((await call(whatif, 'POST', { params: { slug }, body })).json)).toBe('EDIT_TOKEN_INVALID')
    expect((await call(whatif, 'POST', { params: { slug }, token: 'x'.repeat(43), body })).status).toBe(401)
    expect((await call(whatif, 'POST', { params: { slug: 'demo-wedding' }, token, body })).status).toBe(403)
    expect((await call(whatif, 'POST', { params: { slug: 'missingslug1' }, token, body })).status).toBe(404)
    expect((await call(task, 'PATCH', { params: { slug, taskId: 'wedding-0' }, body: { done: true } })).status).toBe(401)
  })
})

describe('what-if, discard, apply', () => {
  it('drafts, rejects unsupported scenarios, discards idempotently, and applies', async () => {
    expect((await call(whatif, 'POST', { ...p(), body: { kind: 'nope' } })).status).toBe(400)
    const w = await call(whatif, 'POST', { ...p(), body: { kind: 'guest_change', value: 150 } })
    expect(w.status).toBe(200)
    expect((await call(discard, 'DELETE', p())).status).toBe(204)
    expect((await call(discard, 'DELETE', p())).status).toBe(204)
    expect(code((await call(apply, 'POST', { ...p(), body: { version: 2 } })).json)).toBe('DRAFT_NOT_FOUND')

    await call(whatif, 'POST', { ...p(), body: { kind: 'guest_change', value: 150 } })
    const applied = await call(apply, 'POST', { ...p(), body: { version: 2 } })
    expect(Plan.parse(applied.json).input.guestCount).toBe(150)
    expect((await call(apply, 'POST', { ...p(), body: { version: 2 } })).status).toBe(200) // idempotent
  })

  it('422 for venue cancelled on a community event', async () => {
    const res = await call(create, 'POST', { body: input({ eventType: 'community', priorities: ['Food'] }) })
    const c = res.json as unknown as { slug: string; editToken: string }
    const r = await call(whatif, 'POST', { params: { slug: c.slug }, token: c.editToken, body: { kind: 'venue_cancelled' } })
    expect(r.status).toBe(422)
    expect(ApiErrorBody.parse(r.json).error.message).toBe("That scenario doesn't apply to this event type.")
  })

  it('502 when the assistant is down for a custom scenario', async () => {
    t.ai.generateJson = async () => {
      throw (await import('@/lib/server/http/errors')).errors.ai()
    }
    expect((await call(whatif, 'POST', { ...p(), body: { kind: 'custom', text: 'cut budget 10%' } })).status).toBe(502)
  })
})

describe('edits', () => {
  it('tasks, vendors and ideas: 204, 404 for unknown ids, 400 for non-whitelisted fields', async () => {
    expect((await call(task, 'PATCH', { ...p({ taskId: 'wedding-0' }), body: { done: true } })).status).toBe(204)
    expect((await call(task, 'PATCH', { ...p({ taskId: 'nope' }), body: { done: true } })).status).toBe(404)
    expect((await call(vendor, 'PATCH', { ...p({ vendorId: 'vendor-catering' }), body: { status: 'booked', notes: 'Tasting on Friday' } })).status).toBe(204)
    expect((await call(vendor, 'PATCH', { ...p({ vendorId: 'vendor-catering' }), body: { estLow: 1 } })).status).toBe(400)
    const ideaId = Plan.parse((await call(read, 'GET', { params: { slug } })).json).current.ideas[0]!.id
    expect((await call(idea, 'PATCH', { ...p({ ideaId }), body: { saved: true } })).status).toBe(204)
    const plan = Plan.parse((await call(read, 'GET', { params: { slug } })).json)
    expect(plan.current.vendors.find((v) => v.id === 'vendor-catering')).toMatchObject({ status: 'booked', notes: 'Tasting on Friday' })
    expect(plan.current.ideas[0]?.saved).toBe(true)
  })

  it('vendors: add your own, record contact and quote, remove only your own', async () => {
    expect((await call(addVendor, 'POST', { params: { slug }, body: { category: 'Catering' } })).status).toBe(401)
    const added = await call(addVendor, 'POST', { ...p(), body: { category: 'Catering', name: 'Second caterer' } })
    expect(added.status).toBe(201)
    const v = PlanVersion.parse(added.json).vendors.at(-1)
    expect(v).toMatchObject({ id: 'custom-1', custom: true, name: 'Second caterer' })
    expect((await call(addVendor, 'POST', { ...p(), body: { category: 'Catering', estHigh: 1 } })).status).toBe(400)

    const edit = { ...p({ vendorId: 'custom-1' }), body: { contact: 'hello@example.com', quote: 85000, status: 'quote_received' } }
    expect((await call(vendor, 'PATCH', edit)).status).toBe(204)
    expect((await call(vendor, 'PATCH', { ...p({ vendorId: 'custom-1' }), body: { quote: -5 } })).status).toBe(400)
    let plan = Plan.parse((await call(read, 'GET', { params: { slug } })).json)
    expect(plan.current.vendors.find((x) => x.id === 'custom-1')).toMatchObject({ contact: 'hello@example.com', quote: 85000 })

    expect(code((await call(removeVendor, 'DELETE', p({ vendorId: 'vendor-catering' }))).json)).toBe('UNSUPPORTED')
    expect((await call(removeVendor, 'DELETE', p({ vendorId: 'nope' }))).status).toBe(404)
    expect((await call(removeVendor, 'DELETE', p({ vendorId: 'custom-1' }))).status).toBe(204)
    plan = Plan.parse((await call(read, 'GET', { params: { slug } })).json)
    expect(plan.current.vendors.some((x) => x.custom)).toBe(false)
  })

  it('vendors: at most 20 added per plan', async () => {
    for (let i = 0; i < 20; i++) expect((await call(addVendor, 'POST', { ...p(), body: { category: 'Other' } })).status).toBe(201)
    const r = await call(addVendor, 'POST', { ...p(), body: { category: 'Other' } })
    expect(r.status).toBe(422)
    expect(ApiErrorBody.parse(r.json).error.message).toMatch(/up to 20/)
  })

  it('409 when the plan keeps changing underneath', async () => {
    t.repo.updateVersion = async () => null
    const r = await call(task, 'PATCH', { ...p({ taskId: 'wedding-0' }), body: { done: true } })
    expect(r.status).toBe(409)
    expect(ApiErrorBody.parse(r.json).error.message).toBe('The plan changed. Reload and try again.')
  })

  it('budget: 200 with the new version, 422 when it does not add up or ids are unknown', async () => {
    const lines = Plan.parse((await call(read, 'GET', { params: { slug } })).json).current.lines
    const amounts = Object.fromEntries(lines.map((l) => [l.id, l.amount]))
    expect((await call(budget, 'PATCH', { ...p(), body: { amounts: { ...amounts, catering: 1 } } })).status).toBe(422)
    expect((await call(budget, 'PATCH', { ...p(), body: { amounts: { ghost: 0 } } })).status).toBe(422)
    expect(PlanVersion.parse((await call(budget, 'PATCH', { ...p(), body: { amounts } })).json).budgetTotal).toBe(300000)
  })
})

describe('assistant routes', () => {
  it('regenerate returns ideas; ask returns a grounded answer', async () => {
    const ideas = Idea.array().parse((await call(regenerate, 'POST', { ...p(), body: {} })).json)
    expect(ideas.length).toBeGreaterThanOrEqual(12)
    const a = AskResponse.parse((await call(ask, 'POST', { ...p(), body: { question: 'How much for catering?', history: [] } })).json)
    expect(a.references[0]?.id).toBe('catering')
    expect((await call(ask, 'POST', { ...p(), body: { question: '', history: [] } })).status).toBe(400)
  })
})

describe('health, cron, and unknown errors', () => {
  it('health reports presence booleans only', async () => {
    const res = await health()
    const body = (await res.json()) as { env: Record<string, unknown> }
    expect(Object.values(body.env).every((v) => typeof v === 'boolean')).toBe(true)
  })

  it('cron needs the bearer secret', async () => {
    expect((await call(cleanup, 'GET')).status).toBe(401)
    t.setNow(new Date(NOW.getTime() + 91 * 86400_000))
    const ok = await call(cleanup, 'GET', { headers: { authorization: 'Bearer test-cron-secret' } })
    expect(ok.json).toMatchObject({ ok: true, deleted: { plans: 1 } })
  })

  it('turns unknown errors into a generic 500 with a request id and no stack', async () => {
    t.repo.get = async () => {
      throw new Error('connection reset at db.internal:5432')
    }
    const r = await call(read, 'GET', { params: { slug } })
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.json)).not.toMatch(/db\.internal|at |Error/)
    expect(r.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})
