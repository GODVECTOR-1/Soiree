import { describe, expect, it } from 'vitest'
import { previewVersion } from '@/lib/domain/baseline'
import { allTasks } from '@/lib/domain/timeline'
import { createPlan } from '@/lib/server/services/createPlan'
import { getPlan } from '@/lib/server/services/getPlan'
import { runWhatIf } from '@/lib/server/services/runWhatIf'
import { applyVersion } from '@/lib/server/services/applyVersion'
import { saveBudget, updateTask } from '@/lib/server/services/editPlan'
import { regenerateIdeas } from '@/lib/server/services/regenerateIdeas'
import { askPlanner } from '@/lib/server/services/askPlanner'
import { AppError } from '@/lib/server/http/errors'
import { withDeadline } from '@/lib/server/deadline'
import { input, testContainer } from '../helpers'

const boom = () => {
  throw new Error('model down')
}
const allDown = { allocation_review: boom, timeline: boom, vendor_questions: boom, ideas: boom, narrative: boom, ask: boom, custom_mapping: boom }

async function made(opts: Parameters<typeof testContainer>[0] = {}, patch = {}) {
  const t = testContainer(opts)
  const { slug, editToken } = await createPlan(t.c, input(patch))
  const record = await t.repo.get(slug)
  if (!record) throw new Error('not stored')
  return { ...t, slug, editToken, record }
}

const status = (p: Promise<unknown>) => p.then(() => 0, (e: unknown) => (e instanceof AppError ? e.status : -1))

describe('createPlan', () => {
  it('still creates a full plan with deterministic content when every AI call fails', async () => {
    const { record, ai } = await made({ ai: allDown }, { notes: 'A small garden lunch.' })
    const template = previewVersion(record.input, '2026-11-01')
    expect(record.current.lines).toEqual(template.lines)
    expect(record.current.ideas).toEqual(template.ideas)
    expect(record.current.vendors.map((v) => v.questionsToAsk)).toEqual(template.vendors.map((v) => v.questionsToAsk))
    expect(ai.calls.filter((c) => c.task === 'ideas')).toHaveLength(2) // one retry, then fallback
  })

  it('does not retry a timed-out call', async () => {
    const timeout = () => {
      throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
    }
    const { record, ai } = await made({ ai: { ideas: timeout } })
    expect(ai.calls.filter((c) => c.task === 'ideas')).toHaveLength(1)
    expect(record.current.ideas).toEqual(previewVersion(record.input, '2026-11-01').ideas)
  })

  it('does not retry when the provider quota is used up (429)', async () => {
    const quota = () => {
      throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 })
    }
    const { record, ai } = await made({ ai: { ideas: quota } })
    expect(ai.calls.filter((c) => c.task === 'ideas')).toHaveLength(1)
    expect(record.current.ideas).toHaveLength(12) // template fallback
  })

  it('skips AI calls once the request deadline is nearly spent, and still creates the plan', async () => {
    const { c, ai, repo } = testContainer()
    const { slug } = await withDeadline(1_500, () => createPlan(c, input({ notes: 'Garden lunch.' })))
    expect(ai.calls).toHaveLength(0)
    expect((await repo.get(slug))?.current.lines).toEqual(previewVersion(input(), '2026-11-01').lines)
  })

  it('falls back to the baseline when the allocation review breaks guardrails twice', async () => {
    const greedy = ({ facts }: { facts: Record<string, unknown> }) => ({
      lines: (facts.lines as { id: string; baselineSharePct: number }[]).map((l, i) => ({ id: l.id, sharePct: i === 0 ? l.baselineSharePct + 20 : l.baselineSharePct, rationale: 'x', tradeoffNote: 'y' })),
    })
    const { record } = await made({ ai: { allocation_review: greedy } })
    expect(record.current.lines).toEqual(previewVersion(record.input, '2026-11-01').lines)
  })

  it('applies a valid review: new shares, AI rationale, exact sum, number guard on the text', async () => {
    const tweak = ({ facts }: { facts: Record<string, unknown> }) => {
      const lines = facts.lines as { id: string; baselineSharePct: number; isPriority: boolean }[]
      const move = (l: (typeof lines)[number]) => (l.id === 'music-and-sound' ? -2 : l.id === 'buffer' ? 2 : 0)
      return { lines: lines.map((l) => ({ id: l.id, sharePct: l.baselineSharePct + move(l), rationale: l.id === 'buffer' ? 'Keep 99 extra for surprises.' : `Why ${l.id} matters.`, tradeoffNote: 'Trim later.' })) }
    }
    const { record } = await made({ ai: { allocation_review: tweak } })
    const lines = record.current.lines
    expect(lines.reduce((a, l) => a + l.amount, 0)).toBe(300000)
    expect(lines.find((l) => l.id === 'catering')?.rationale).toBe('Why catering matters.')
    expect(lines.find((l) => l.id === 'buffer')?.rationale).not.toContain('99') // invented number replaced by template
  })

  it('personalizes the timeline from notes with stable ids', async () => {
    const timeline = () => ({ renames: [{ id: 'wedding-0', title: 'Agree the guest list with both families' }], additions: [{ title: 'Book a henna artist', offsetDays: 40 }] })
    const { record } = await made({ ai: { timeline } }, { notes: 'We want henna.' })
    const tasks = allTasks(record.current.phases)
    expect(tasks.find((t) => t.id === 'wedding-0')?.title).toBe('Agree the guest list with both families')
    expect(tasks.some((t) => t.id === 'note-0')).toBe(true)
  })

  it('rejects past dates, late planning starts and unknown priorities', async () => {
    const { c } = testContainer()
    expect(await status(createPlan(c, input({ date: '2026-10-30' })))).toBe(400)
    expect(await status(createPlan(c, input({ date: '2026-10-31', planningStart: '2026-10-01' })))).toBe(0) // one day of time-zone slack
    expect(await status(createPlan(c, input({ planningStart: '2027-03-01' })))).toBe(400)
    expect(await status(createPlan(c, input({ priorities: ['Food'] })))).toBe(400)
  })
})

describe('what-if, apply and edits', () => {
  it('replaces a bad narrative with the template (number guard)', async () => {
    const { c, record } = await made({ ai: { narrative: () => ({ narrative: 'Catering now gets 777777, a huge jump.' }) } })
    const r = await runWhatIf(c, record, { kind: 'budget_change', value: -20 })
    expect(r.draft.narrative).not.toContain('777777')
    expect(r.draft.narrative).toMatch(/protected/i)
  })

  it('maps custom text, and returns 422 when it cannot', async () => {
    const { c, record } = await made()
    expect((await runWhatIf(c, record, { kind: 'custom', text: 'What if we cut the budget by 15%?' })).inputPatch).toEqual({ totalBudget: 255000 })
    expect(await status(runWhatIf(c, record, { kind: 'custom', text: 'hire a unicorn' }))).toBe(422)
    expect(await status(runWhatIf(c, record, { kind: 'custom' }))).toBe(400)
  })

  it('validates scenario values', async () => {
    const { c, record } = await made()
    expect(await status(runWhatIf(c, record, { kind: 'budget_change', value: -80 }))).toBe(400)
    expect(await status(runWhatIf(c, record, { kind: 'guest_change', value: 120 }))).toBe(400)
    expect(await status(runWhatIf(c, record, { kind: 'date_change', value: -200 }))).toBe(400)
    expect(await status(runWhatIf(c, record, { kind: 'reprioritize', priorities: ['Nope'] }))).toBe(400)
    expect((await runWhatIf(c, record, { kind: 'reprioritize', priorities: ['Decor and flowers'] })).inputPatch).toEqual({ priorities: ['Decor and flowers'] })
  })

  it('stops at the per-plan scenario quota', async () => {
    const { c, record } = await made()
    for (let i = 0; i < 10; i++) await runWhatIf(c, record, { kind: 'budget_change', value: -10 })
    expect(await status(runWhatIf(c, record, { kind: 'budget_change', value: -10 }))).toBe(429)
  })

  it('apply re-merges after a stale result, then gives 409 when it stays stale', async () => {
    const { c, repo, record } = await made()
    const draft = await runWhatIf(c, record, { kind: 'budget_change', value: -20 })
    const real = repo.applyVersion.bind(repo)
    let stale = 1
    repo.applyVersion = async (...args) => (stale-- > 0 ? 'stale' : real(...args))
    expect((await applyVersion(c, record, draft.draft.version)).current.version).toBe(2)

    const fresh = (await repo.get(record.slug))!
    const next = await runWhatIf(c, fresh, { kind: 'budget_change', value: -10 })
    repo.applyVersion = async () => 'stale'
    expect(await status(applyVersion(c, fresh, next.draft.version))).toBe(409)
  })

  it('apply keeps a task ticked after the draft was made, and is idempotent', async () => {
    const { c, repo, record } = await made()
    const draft = await runWhatIf(c, record, { kind: 'date_change', value: 7 })
    const taskId = allTasks(record.current.phases)[0]!.id
    await updateTask(c, record, taskId, true)
    const plan = await applyVersion(c, record, draft.draft.version) // `record` is stale: the service re-reads
    expect(allTasks(plan.current.phases).find((t) => t.id === taskId)?.done).toBe(true)
    expect(plan.input.date).toBe('2027-02-21')
    expect((await applyVersion(c, (await repo.get(record.slug))!, draft.draft.version)).current.version).toBe(2)
  })

  it('edits give 409 when compare-and-set keeps failing', async () => {
    const { c, repo, record } = await made()
    repo.updateVersion = async () => null
    expect(await status(updateTask(c, record, 'wedding-0', true))).toBe(409)
  })

  it('budget saves must add up exactly', async () => {
    const { c, record } = await made()
    const amounts = Object.fromEntries(record.current.lines.map((l) => [l.id, l.amount]))
    amounts.catering = (amounts.catering ?? 0) + 1000
    expect(await status(saveBudget(c, record, amounts))).toBe(422)
    amounts.buffer = (amounts.buffer ?? 0) - 1000
    expect((await saveBudget(c, record, amounts)).vendors[0]?.estLow).toBe(Math.round((amounts.catering ?? 0) * 0.85))
  })
})

describe('assistant', () => {
  it('regenerates ideas and keeps saved ones', async () => {
    const { c, repo, record } = await made()
    const keep = record.current.ideas[3]!
    await repo.updateVersion(record.id, 1, record.current.rev, { ideas: record.current.ideas.map((i) => (i.id === keep.id ? { ...i, saved: true } : i)) })
    const ideas = await regenerateIdeas(c, (await repo.get(record.slug))!, 'more outdoor')
    expect(ideas[0]).toMatchObject({ id: keep.id, saved: true })
    expect(ideas.filter((i) => i.title === keep.title)).toHaveLength(1)
  })

  it('ask drops unknown references and swaps answers with invented numbers', async () => {
    const refs = [{ kind: 'budget', id: 'catering', label: 'Catering' }, { kind: 'vendor', id: 'vendor-made-up', label: 'Fake' }]
    const ok = await made({ ai: { ask: () => ({ answer: 'Catering is your first priority.', references: refs }) } })
    expect((await askPlanner(ok.c, ok.record, { question: 'What about catering?', history: [] })).references).toEqual([refs[0]])

    const bad = await made({ ai: { ask: () => ({ answer: 'Catering costs 123456 here.', references: refs }) } })
    const r = await askPlanner(bad.c, bad.record, { question: 'Cost?', history: [] })
    expect(r.answer).toMatch(/could not answer that reliably/)
    expect(r.references).toEqual([])
  })

  it('serves demo plans dated from today, never stored', async () => {
    const { c } = testContainer()
    const { plan, etag } = await getPlan(c, 'demo-birthday')
    expect(plan).toMatchObject({ readOnly: true, input: { planningStart: '2026-11-01', date: '2026-12-08' } })
    expect(etag).toBe('W/"demo-2026-11-01"')
  })
})
