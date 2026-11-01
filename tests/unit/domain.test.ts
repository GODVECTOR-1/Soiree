import { describe, expect, it } from 'vitest'
import { samples, type PlanInput, type PlanVersion } from '@/lib/schemas'
import { previewVersion } from '@/lib/domain/baseline'
import { runScenario } from '@/lib/domain/scenarios'
import { allTasks, buildPhases, toPhases } from '@/lib/domain/timeline'
import { buildVendors, withEstimates } from '@/lib/domain/vendors'
import { buildIdeas } from '@/lib/domain/ideas'
import { buildDiff } from '@/lib/domain/diff'
import { applyAction, mergeProgress } from '@/lib/domain/actions'
import { distribute, priorityError } from '@/lib/domain/templates'
import { allocate, totalCheck } from '@/lib/domain/allocate'

const TODAY = '2026-11-01'
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const wedding: PlanInput = { ...samples.wedding, planningStart: TODAY }
const base = () => previewVersion(wedding, TODAY)
const ids = (v: PlanVersion) =>
  allTasks(v.phases)
    .map((t) => t.id)
    .sort()

describe('templates and allocation', () => {
  it('distributes exactly, including all-zero weights', () => {
    expect(sum(distribute(101, [1, 1, 1]))).toBe(101)
    expect(distribute(3, [0, 0, 0])).toEqual([1, 1, 1])
  })

  it('validates priorities against the event type', () => {
    expect(priorityError('wedding', ['Catering'])).toBeNull()
    expect(priorityError('wedding', [])).toMatch(/one to three/)
    expect(priorityError('wedding', ['Catering', 'Catering'])).toMatch(/once/)
    expect(priorityError('wedding', ['Food'])).toMatch(/does not fit/)
  })

  it('moves venue share to priorities in smaller cities, unless venue is a priority', () => {
    const metro = allocate({ ...wedding, cityTier: 1 })
    const town = allocate({ ...wedding, cityTier: 3 })
    const venue = (ls: typeof metro) =>
      ls.find((l) => l.category === 'Venue and rentals')?.amount ?? 0
    expect(venue(town)).toBeLessThan(venue(metro))
    const venueFirst = { ...wedding, priorities: ['Venue and rentals'] }
    expect(venue(allocate({ ...venueFirst, cityTier: 3 }))).toBeGreaterThanOrEqual(
      venue(allocate({ ...venueFirst, cityTier: 1 })),
    )
  })
})

describe('timeline', () => {
  it('moves overdue tasks to "This week" as ASAP and keeps ids', () => {
    const near = { ...wedding, date: '2026-12-01' }
    const phases = buildPhases(near, TODAY)
    expect(phases[0]?.label).toBe('This week')
    expect(phases[0]?.tasks.every((t) => t.dueLabel === 'ASAP')).toBe(true)
    expect(ids({ ...base(), phases })).toEqual(ids(base()))
  })

  it('keeps titles, ids and progress when re-bucketed, and puts offset-less tasks first', () => {
    const tasks = allTasks(base().phases).map((t, i) => ({ ...t, done: i === 0 }))
    const phases = toPhases(
      [{ id: 'urgent', title: 'Do now', dueLabel: '', done: false }, ...tasks],
      wedding.date,
      TODAY,
    )
    expect(phases[0]?.tasks[0]?.id).toBe('urgent')
    expect(allTasks(phases).find((t) => t.id === tasks[0]?.id)?.done).toBe(true)
  })

  it('applies renames by id and adds note tasks', () => {
    const phases = buildPhases(wedding, TODAY, {
      renames: { 'wedding-0': 'Agree the guest list together' },
      additions: [{ title: 'Book a henna artist', offsetDays: 40 }],
    })
    const all = allTasks(phases)
    expect(all.find((t) => t.id === 'wedding-0')?.title).toBe('Agree the guest list together')
    expect(all.find((t) => t.id === 'note-0')?.dueLabel).toMatch(/^By /)
  })

  it('turns needs and traditions in notes into tasks', () => {
    const notes =
      'Traditional two-day wedding. Grandpa is deaf, so we need a sign language interpreter. A quiet room for sensory needs. Halal food please.'
    const all = allTasks(buildPhases({ ...wedding, notes }, TODAY)).map((t) => t.id)
    expect(all).toEqual(
      expect.arrayContaining([
        'needs-sign',
        'needs-sensory',
        'needs-diet',
        'wedding-multi-0',
        'wedding-trad-0',
      ]),
    )
    expect(
      allTasks(buildPhases({ ...wedding, notes: 'halal' }, TODAY)).find(
        (t) => t.id === 'needs-diet',
      )?.title,
    ).toContain('halal')
  })
})

describe('vendors and ideas', () => {
  it('skips non-vendor lines and derives 0.85x to 1.15x estimates', () => {
    const c = { ...samples.community, planningStart: TODAY }
    const v = buildVendors(c, allocate(c))
    expect(v.map((x) => x.category)).not.toEqual(expect.arrayContaining(['Volunteers']))
    expect(v.some((x) => ['Permits', 'Contingency reserve'].includes(x.category))).toBe(false)
    const lines = allocate(c)
    const food = lines.find((l) => l.category === 'Food')?.amount ?? 0
    expect(v.find((x) => x.category === 'Food')).toMatchObject({
      estLow: Math.round(food * 0.85),
      estHigh: Math.round(food * 1.15),
      verifyBeforeDeposit: true,
    })
  })

  it('re-derives shares and estimates after a budget edit', () => {
    const v = base()
    const next = withEstimates({
      ...v,
      lines: v.lines.map((l, i) => (i === 0 ? { ...l, amount: 150000 } : l)),
    })
    expect(next.lines[0]?.sharePct).toBe(50)
    expect(next.vendors[0]?.estHigh).toBe(172500)
  })

  it('has 12 template ideas per event type with the required mix', () => {
    for (const type of ['wedding', 'birthday', 'community'] as const) {
      const ideas = buildIdeas({ eventType: type, priorities: [] })
      expect(ideas).toHaveLength(12)
      for (const [kind, min] of [
        ['theme', 2],
        ['menu', 2],
        ['activity', 2],
        ['decor', 2],
        ['music', 1],
        ['favor', 1],
      ] as const)
        expect(ideas.filter((i) => i.kind === kind).length).toBeGreaterThanOrEqual(min)
      expect(ideas.every((i) => i.fitsPriority === undefined)).toBe(true)
    }
  })
})

describe('scenarios', () => {
  it('gives priorities 60% of new money on an increase', () => {
    const v = base()
    const r = runScenario(wedding, v, { kind: 'budget_change', value: 10 })
    const gain = (pri: boolean) =>
      sum(
        r.diff.rows
          .filter((row) => v.lines.find((l) => l.category === row.category)?.isPriority === pri)
          .map((row) => row.after - row.before),
      )
    expect(gain(true)).toBe(18000)
    expect(r.diff.totalCheck.ok).toBe(true)
    expect(r.inputPatch).toEqual({ totalBudget: 330000 })
  })

  it('breaks floors only when it must, and says so', () => {
    const r = runScenario(wedding, base(), { kind: 'budget_change', value: -50 })
    expect(r.floorsBroken).toBe(true)
    expect(r.draft.narrative).toMatch(/bigger than the flexible lines/)
    expect(r.diff.totalCheck.ok).toBe(true)
  })

  it('scales per-guest lines on a guest change and keeps the total', () => {
    const v = base()
    const r = runScenario(wedding, v, { kind: 'guest_change', guests: 60 })
    const catering = r.diff.rows.find((x) => x.category === 'Catering')
    expect(catering && catering.after).toBeLessThan(catering?.before ?? 0)
    expect(r.diff.totalCheck.allocated).toBe(v.budgetTotal)
    expect(r.inputPatch).toEqual({ guestCount: 60 })
  })

  it('venue cancelled: +15% venue, same total, urgent tasks first, venue vendor rebooked under a new id', () => {
    const v = base()
    v.vendors = v.vendors.map((x) =>
      x.category === 'Venue and rentals' ? { ...x, status: 'booked' as const } : x,
    )
    const r = runScenario(wedding, v, { kind: 'venue_cancelled', today: TODAY })
    const row = r.diff.rows.find((x) => x.category === 'Venue and rentals')
    expect(row && row.after - row.before).toBe(Math.round((row?.before ?? 0) * 0.15))
    expect(r.diff.totalCheck.ok).toBe(true)
    expect(r.draft.phases[0]?.tasks[0]?.id).toBe('venue-emergency-0-v2')
    const venue = r.draft.vendors.find((x) => x.category === 'Venue and rentals')
    expect(venue).toMatchObject({ id: 'vendor-venue-and-rentals-r2', status: 'not_started' })
    // Apply keeps other progress but cannot restore the old booking.
    expect(
      mergeProgress(v, r.draft).vendors.find((x) => x.category === 'Venue and rentals')?.status,
    ).toBe('not_started')
  })

  it('venue cancelled is a no-op for community (the service rejects it first)', () => {
    const c = { ...samples.community, planningStart: TODAY }
    const v = previewVersion(c, TODAY)
    expect(
      runScenario(c, v, { kind: 'venue_cancelled', today: TODAY }).diff.rows.every(
        (r) => r.deltaPct === 0,
      ),
    ).toBe(true)
  })

  it('date change keeps every task id, adds reconfirm tasks for booked vendors, keeps the budget', () => {
    const v = base()
    v.vendors[0] = { ...v.vendors[0]!, status: 'booked' }
    const r = runScenario(wedding, v, { kind: 'date_change', days: 14, today: TODAY })
    expect(r.inputPatch).toEqual({ date: '2027-02-28' })
    expect(ids(r.draft)).toEqual([...ids(v), `reconfirm-${v.vendors[0]!.id}-v2`].sort())
    expect(r.draft.budgetTotal).toBe(v.budgetTotal)
    expect(allTasks(r.draft.phases).find((t) => t.id.startsWith('reconfirm'))?.title).toBe(
      'Reconfirm catering availability for the new date',
    )
  })

  it('reprioritize reruns the allocator on the same total', () => {
    const r = runScenario(wedding, base(), {
      kind: 'reprioritize',
      priorities: ['Music and sound'],
    })
    expect(r.draft.lines.find((l) => l.category === 'Music and sound')?.isPriority).toBe(true)
    expect(r.diff.rows.find((x) => x.category === 'Music and sound')?.protected).toBe(true)
    expect(totalCheck(r.draft.lines, r.draft.budgetTotal).ok).toBe(true)
    expect(r.inputPatch).toEqual({ priorities: ['Music and sound'] })
  })
})

describe('diff and actions', () => {
  it('lists only open tasks tagged with categories that moved more than 10%', () => {
    const v = base()
    const cut = runScenario(wedding, v, { kind: 'budget_change', value: -20 })
    const diff = buildDiff(v, cut.draft)
    expect(diff.impactedTasks).toContain('Book music and sound')
    const done = {
      ...v,
      phases: v.phases.map((p) => ({ ...p, tasks: p.tasks.map((t) => ({ ...t, done: true })) })),
    }
    expect(buildDiff(done, cut.draft).impactedTasks).toEqual([])
    expect(diff).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      budgetFrom: 300000,
      budgetTo: 240000,
    })
  })

  it('reduces every action and merges progress on apply', () => {
    const v = base()
    const ideaId = v.ideas[0]!.id
    let s = applyAction(wedding, v, { type: 'idea', id: ideaId })
    expect(s.version.ideas[0]?.saved).toBe(true)
    s = applyAction(wedding, s.version, { type: 'ideas', ideas: s.version.ideas.slice(0, 2) })
    expect(s.version.ideas).toHaveLength(2)
    const amounts = Object.fromEntries(v.lines.map((l) => [l.id, l.amount]))
    s = applyAction(wedding, s.version, { type: 'budget', amounts })
    const draft = runScenario(wedding, v, { kind: 'guest_change', guests: 100 })
    const applied = applyAction(wedding, s.version, { type: 'apply', result: draft })
    expect(applied.version.ideas).toHaveLength(2) // regenerated ideas survive Apply
    expect(applied.input.guestCount).toBe(100)
  })
})
