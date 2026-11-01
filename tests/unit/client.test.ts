import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/lib/api'
import { ApiError, createPlan, errorMessage, getPlan, regenerateIdeas, updateTask } from '@/lib/api'
import { forgetPlan, getToken, listLocalPlans, rememberPlan, saveToken } from '@/lib/local-plans'
import {
  MAX_PRIORITIES,
  basicsErrors,
  blankInput,
  parseDraft,
  splitList,
  stepProblems,
  togglePriority,
} from '@/lib/plan-form'
import { eventColors, eventLabels } from '@/lib/event-theme'
import { PlanInput, samples } from '@/lib/schemas'

// Browser-side modules: the API client, the device's plan list, the wizard's form rules and the event theme.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('API client', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => vi.stubGlobal('fetch', fetchMock))
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('sends JSON with the edit token and parses the response with its schema', async () => {
    fetchMock.mockResolvedValue(json(201, { slug: 'abcdefghijkl', editToken: 'x'.repeat(32) }))
    await expect(createPlan(samples.wedding)).resolves.toEqual({
      slug: 'abcdefghijkl',
      editToken: 'x'.repeat(32),
    })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } })

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(updateTask('a b', 'tok', 'task/1', true)).resolves.toBeUndefined()
    const [url, patch] = fetchMock.mock.calls[1]!
    expect(url).toBe('/api/plans/a%20b/tasks/task%2F1') // path segments are encoded
    expect(patch?.headers).toMatchObject({ 'x-edit-token': 'tok' })
  })

  it('turns error bodies, bad bodies, bad shapes and offline into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, { error: { code: 'RATE_LIMITED', message: 'Slow down.', retryAfterSec: 30 } }),
    )
    await expect(getPlan('abc')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterSec: 30,
      message: 'Slow down.',
    })

    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }))
    await expect(getPlan('abc')).rejects.toMatchObject({ code: 'HTTP_502', status: 502 })

    fetchMock.mockResolvedValueOnce(json(200, { not: 'a plan' }))
    await expect(getPlan('abc')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(getPlan('abc')).rejects.toMatchObject({ code: 'NETWORK', status: 0 })
  })

  it('calls every endpoint with its documented method and path', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    const endpoints: [() => Promise<unknown>, string, string][] = [
      [
        () => api.runWhatIf('s', 't', { kind: 'budget_change', value: -20 }),
        'POST',
        '/api/plans/s/whatif',
      ],
      [() => api.discardDraft('s', 't'), 'DELETE', '/api/plans/s/whatif'],
      [() => api.applyVersion('s', 't', 2), 'POST', '/api/plans/s/apply'],
      [
        () => api.updateVendor('s', 't', 'v', { status: 'booked' }),
        'PATCH',
        '/api/plans/s/vendors/v',
      ],
      [() => api.addVendor('s', 't', { category: 'Catering' }), 'POST', '/api/plans/s/vendors'],
      [() => api.removeVendor('s', 't', 'v'), 'DELETE', '/api/plans/s/vendors/v'],
      [() => api.updateIdea('s', 't', 'i', true), 'PATCH', '/api/plans/s/ideas/i'],
      [() => api.saveBudget('s', 't', { a: 1 }), 'PATCH', '/api/plans/s/budget'],
      [() => api.askPlanner('s', 't', { question: 'Hi', history: [] }), 'POST', '/api/plans/s/ask'],
    ]
    for (const [run, method, path] of endpoints) {
      await run().catch(() => undefined) // 204 has no body, so endpoints that return data reject: only the call matters here
      const [url, init] = fetchMock.mock.lastCall!
      expect([init?.method, url]).toEqual([method, path])
      expect(init?.headers).toMatchObject({ 'x-edit-token': 't' })
    }
  })

  it('omits an empty feedback string and shows friendly messages for any thrown value', async () => {
    fetchMock.mockResolvedValue(json(200, []))
    await regenerateIdeas('abc', 'tok', '')
    expect(fetchMock.mock.calls[0]![1]?.body).toBe('{}')
    expect(errorMessage(new ApiError('X', 'Plain message.', 400))).toBe('Plain message.')
    expect(errorMessage(new Error('stack trace'))).toBe('Something went wrong. Please try again.')
  })
})

describe('plans on this device', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => vi.unstubAllGlobals())

  const plan = (slug: string) => ({
    slug,
    title: `Plan ${slug}`,
    eventType: 'birthday' as const,
    date: '2027-01-01',
  })

  it('keeps the most recent plan first, without duplicates, and forgets both index and token', () => {
    saveToken('a', 'token-a')
    rememberPlan(plan('a'))
    rememberPlan(plan('b'))
    rememberPlan(plan('a'))
    expect(listLocalPlans().map((p) => p.slug)).toEqual(['a', 'b'])
    expect(getToken('a')).toBe('token-a')

    forgetPlan('a')
    expect(listLocalPlans().map((p) => p.slug)).toEqual(['b'])
    expect(getToken('a')).toBeNull()
  })

  it('survives a corrupt index and blocked storage', () => {
    store.set('plan-index', '{not json')
    expect(listLocalPlans()).toEqual([])
    store.set('plan-index', JSON.stringify([{ slug: 1 }]))
    expect(listLocalPlans()).toEqual([])

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(getToken('a')).toBeNull()
    expect(() => saveToken('a', 'x')).not.toThrow()
    expect(() => rememberPlan(plan('a'))).not.toThrow()
  })
})

describe('wizard form rules', () => {
  const today = '2026-11-01'
  const valid = { ...samples.wedding, planningStart: today }

  it('accepts a complete plan and explains each missing or invalid field', () => {
    expect(basicsErrors(valid, today)).toEqual({})
    expect(Object.keys(basicsErrors({ ...blankInput, planningStart: '' }, today)).sort()).toEqual([
      'city',
      'date',
      'guestCount',
      'planningStart',
      'title',
      'totalBudget',
    ])
    expect(basicsErrors({ ...valid, date: '2026-10-31' }, today).date).toMatch(/today or later/)
    expect(basicsErrors({ ...valid, planningStart: '2099-01-01' }, today).planningStart).toMatch(
      /on or before/,
    )
    expect(basicsErrors({ ...valid, guestCount: 5001 }, today).guestCount).toMatch(/5,000/)
    expect(basicsErrors({ ...valid, totalBudget: 10.5 }, today).totalBudget).toMatch(
      /whole numbers/,
    )
    expect(basicsErrors({ ...valid, title: '   ' }, today).title).toBeDefined()
  })

  it('the blank draft is not a valid plan, so it can never be submitted', () => {
    expect(PlanInput.safeParse(blankInput).success).toBe(false)
  })

  it('restores an unfinished draft, and starts fresh from anything malformed', () => {
    const half = {
      ...blankInput,
      eventType: 'birthday',
      title: 'Asha turns 40',
      planningStart: today,
    }
    expect(parseDraft(JSON.stringify(half), today)).toEqual(half)
    const fresh = { ...blankInput, planningStart: today }
    expect(parseDraft(null, today)).toEqual(fresh)
    expect(parseDraft('{oops', today)).toEqual(fresh)
    expect(parseDraft(JSON.stringify({ ...half, eventType: 'party' }), today)).toEqual(fresh)
  })

  it('splits comma lists into at most four short words', () => {
    expect(splitList(' Garden, warm ,, playful ')).toEqual(['Garden', 'warm', 'playful'])
    expect(splitList('a,b,c,d,e')).toHaveLength(4)
    expect(splitList('x'.repeat(40))[0]).toHaveLength(30)
    expect(splitList('')).toEqual([])
  })

  it('ranks priorities in pick order, removes on a second pick, and stops at the limit', () => {
    let p: string[] = []
    for (const c of ['Catering', 'Venue', 'Decor', 'Music']) p = togglePriority(p, c)
    expect(p).toEqual(['Catering', 'Venue', 'Decor'])
    expect(p).toHaveLength(MAX_PRIORITIES)
    expect(togglePriority(p, 'Venue')).toEqual(['Catering', 'Decor'])
  })
})

describe('event theme', () => {
  it('names every event and keeps canvas accents in step with the CSS tokens', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    for (const type of Object.keys(eventLabels) as (keyof typeof eventLabels)[]) {
      expect(eventLabels[type]).toBeTruthy()
      expect(css).toMatch(
        new RegExp(
          `\\[data-event='${type}'\\]\\s*\\{\\s*--accent:\\s*${eventColors[type].accent};`,
        ),
      )
    }
  })
})

describe('wizard steps', () => {
  const today = '2026-11-01'
  const valid = { ...samples.wedding, planningStart: today }

  it('stops on the basics with field errors, and on priorities with a message', () => {
    expect(stepProblems(1, blankInput, today)).toEqual({ fields: {}, message: '' })
    expect(
      Object.keys(stepProblems(2, { ...blankInput, planningStart: today }, today).fields),
    ).toContain('title')
    expect(stepProblems(2, valid, today)).toEqual({ fields: {}, message: '' })
    expect(stepProblems(3, { ...valid, priorities: [] }, today).message).toBe(
      'Choose at least one priority.',
    )
    expect(stepProblems(3, valid, today).message).toBe('')
  })
})
