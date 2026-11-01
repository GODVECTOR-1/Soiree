import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { categories } from '@/lib/categories'
import { allocate } from '@/lib/domain/allocate'
import { previewVersion } from '@/lib/domain/baseline'
import { runScenario } from '@/lib/domain/scenarios'
import { allTasks } from '@/lib/domain/timeline'
import { templateFor } from '@/lib/domain/templates'
import type { PlanInput } from '@/lib/schemas'

const TODAY = '2026-11-01'
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

const planInput: fc.Arbitrary<PlanInput> = fc
  .constantFrom('wedding', 'birthday', 'community' as const)
  .chain((eventType) =>
    fc.record({
      eventType: fc.constant(eventType),
      title: fc.constant('Property test'),
      city: fc.constant('Pune'),
      date: fc.constant('2027-03-01'),
      planningStart: fc.constant(TODAY),
      guestCount: fc.integer({ min: 1, max: 5000 }),
      cityTier: fc.constantFrom(1, 2, 3 as const),
      currency: fc.constantFrom('INR', 'USD', 'EUR', 'GBP' as const),
      totalBudget: fc.integer({ min: 1, max: 1_000_000_000 }),
      priorities: fc.shuffledSubarray([...categories[eventType]], { minLength: 1, maxLength: 3 }),
      vibes: fc.constant([]),
      diet: fc.constant([]),
      accessibility: fc.boolean(),
      notes: fc.constant(undefined),
    }),
  )

const runs = { numRuns: 300 }

describe('allocator properties', () => {
  it('always sums exactly and is deterministic', () => {
    fc.assert(
      fc.property(planInput, (input) => {
        const lines = allocate(input)
        expect(sum(lines.map((l) => l.amount))).toBe(input.totalBudget)
        expect(allocate(input)).toEqual(lines)
        expect(lines.every((l) => l.amount >= 0)).toBe(true)
      }),
      runs,
    )
  })

  it('a cut sums exactly, never lowers a coverable priority, and holds floors unless it says they broke', () => {
    fc.assert(
      fc.property(planInput, fc.integer({ min: -50, max: -1 }), (input, value) => {
        const v = previewVersion(input, TODAY)
        const r = runScenario(input, v, { kind: 'budget_change', value })
        expect(r.diff.totalCheck.ok).toBe(true)
        // Priorities give only when the other lines cannot cover the cut (tiny budgets).
        const coverable =
          sum(v.lines.filter((l) => !l.isPriority).map((l) => l.amount)) >=
          v.budgetTotal - r.draft.budgetTotal
        for (const before of v.lines) {
          const after = r.draft.lines.find((l) => l.id === before.id)?.amount ?? 0
          if (before.isPriority && coverable) expect(after).toBe(before.amount)
          if (!before.isPriority && !r.floorsBroken) {
            const floor = Math.round(
              (r.draft.budgetTotal * (templateFor(input.eventType, before.category)?.share ?? 0)) /
                200,
            )
            expect(after).toBeGreaterThanOrEqual(Math.min(before.amount, floor))
          }
        }
      }),
      runs,
    )
  })

  it('every other scenario keeps the total exact and priorities whole on increases', () => {
    fc.assert(
      fc.property(
        planInput,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: -60, max: 365 }),
        (input, up, guests, days) => {
          const v = previewVersion(input, TODAY)
          const more = runScenario(input, v, { kind: 'budget_change', value: up })
          expect(more.diff.totalCheck.ok).toBe(true)
          for (const l of v.lines.filter((x) => x.isPriority))
            expect(more.draft.lines.find((x) => x.id === l.id)!.amount).toBeGreaterThanOrEqual(
              l.amount,
            )

          expect(
            runScenario(input, v, { kind: 'guest_change', guests }).diff.totalCheck,
          ).toMatchObject({ ok: true, allocated: v.budgetTotal })
          expect(
            runScenario(input, v, { kind: 'venue_cancelled', today: TODAY }).diff.totalCheck.ok,
          ).toBe(true)
          const moved = runScenario(input, v, { kind: 'date_change', days, today: TODAY })
          expect(
            allTasks(moved.draft.phases)
              .map((t) => t.id)
              .sort(),
          ).toEqual(
            allTasks(v.phases)
              .map((t) => t.id)
              .sort(),
          )
          const pri = [...categories[input.eventType]].reverse().slice(0, 2)
          expect(
            runScenario(input, v, { kind: 'reprioritize', priorities: pri }).diff.totalCheck.ok,
          ).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })
})
