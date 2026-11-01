import { beforeEach, describe, expect, it } from 'vitest'
import { POST as create } from '@/app/api/plans/route'
import { GET as getPlan } from '@/app/api/plans/[slug]/route'
import { POST as whatif } from '@/app/api/plans/[slug]/whatif/route'
import { POST as apply } from '@/app/api/plans/[slug]/apply/route'
import { PATCH as task } from '@/app/api/plans/[slug]/tasks/[taskId]/route'
import { Plan, WhatIfResult } from '@/lib/schemas'
import { call, input, testContainer } from '../helpers'

describe('plan flow', () => {
  beforeEach(() => testContainer())

  it('creates, reads, drafts, edits during the draft, and applies keeping progress', async () => {
    const made = await call(create, 'POST', { body: input() })
    expect(made.status).toBe(201)
    const { slug, editToken } = made.json as unknown as { slug: string; editToken: string }
    const read = await call(getPlan, 'GET', { params: { slug } })
    const plan = Plan.parse(read.json)
    expect(plan.readOnly).toBe(false)

    const w = await call(whatif, 'POST', {
      params: { slug },
      token: editToken,
      body: { kind: 'budget_change', value: -20 },
    })
    expect(w.status).toBe(200)
    const draft = WhatIfResult.parse(w.json)
    const taskId = plan.current.phases[0]?.tasks[0]?.id ?? ''
    expect(
      (
        await call(task, 'PATCH', {
          params: { slug, taskId },
          token: editToken,
          body: { done: true },
        })
      ).status,
    ).toBe(204)

    const applied = Plan.parse(
      (
        await call(apply, 'POST', {
          params: { slug },
          token: editToken,
          body: { version: draft.draft.version },
        })
      ).json,
    )
    expect(applied.current.version).toBe(2)
    expect(applied.input.totalBudget).toBe(240000)
    expect(applied.current.phases.flatMap((p) => p.tasks).find((t) => t.id === taskId)?.done).toBe(
      true,
    )
    expect(applied.history.map((h) => h.version)).toEqual([1, 2])
  })
})
