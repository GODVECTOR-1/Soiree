import { describe, expect, it } from 'vitest'
import { allLabels } from '../../lib/categories'
import { money } from '../../lib/format'
import { allocate } from '../../lib/domain/allocate'
import { budgetTemplates } from '../../lib/domain/templates'
import { previewVersion } from '../../lib/domain/baseline'
import { runScenario } from '../../lib/domain/scenarios'
import { applyAction } from '../../lib/domain/actions'
import { samples, type PlanInput } from '../../lib/schemas'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('money', () => {
  it('groups INR in lakh and crore', () => {
    expect(money(300000, 'INR')).toBe('₹3,00,000')
    expect(money(12345678, 'INR')).toBe('₹1,23,45,678')
    expect(money(999, 'INR')).toBe('₹999')
    expect(money(-4500, 'INR')).toBe('-₹4,500')
    expect(money(1234567, 'USD')).toBe('$1,234,567')
  })
})

describe('templates', () => {
  it('sum to 100 and use the wizard labels', () => {
    for (const [type, tpl] of Object.entries(budgetTemplates)) {
      expect(sum(tpl.map((t) => t.share))).toBe(100)
      expect(tpl.map((t) => t.label)).toEqual(allLabels(type as PlanInput['eventType']))
    }
  })
})

describe('allocator and scenarios', () => {
  // Cheap property check: many budgets, tiers and priority orders always add up exactly.
  const cases: PlanInput[] = []
  for (const base of Object.values(samples))
    for (const totalBudget of [1, 7, 999, 80000, 300001, 98765432])
      for (const cityTier of [1, 2, 3] as const) cases.push({ ...base, totalBudget, cityTier })

  it('allocates the exact total and protects priorities on a cut', () => {
    for (const input of cases) {
      const v = previewVersion(input, '2026-11-01')
      expect(sum(v.lines.map((l) => l.amount))).toBe(input.totalBudget)

      const cut = runScenario(input, v, { kind: 'budget_change', value: -20 })
      expect(cut.diff.totalCheck.ok).toBe(true)
      for (const l of v.lines.filter((x) => x.isPriority)) {
        expect(cut.draft.lines.find((x) => x.id === l.id)?.amount).toBe(l.amount)
      }

      const more = runScenario(input, v, { kind: 'guest_change', guests: input.guestCount + 20 })
      expect(more.diff.totalCheck.allocated).toBe(input.totalBudget)
    }
  })

  it('keeps task, vendor and idea progress when a scenario is applied', () => {
    const input = samples.wedding
    let v = previewVersion(input, '2026-11-01')
    const draft = runScenario(input, v, { kind: 'budget_change', value: -20 }) // drafted before the edits below
    const taskId = v.phases[0]?.tasks[0]?.id ?? ''
    const vendorId = v.vendors[0]?.id ?? ''
    v = applyAction(input, v, { type: 'task', id: taskId }).version
    v = applyAction(input, v, { type: 'vendor', id: vendorId, patch: { status: 'booked' } }).version
    const after = applyAction(input, v, { type: 'apply', result: draft })
    expect(after.version.phases.flatMap((p) => p.tasks).find((t) => t.id === taskId)?.done).toBe(true)
    expect(after.version.vendors.find((x) => x.id === vendorId)?.status).toBe('booked')
    expect(after.input.totalBudget).toBe(240000)
  })

  it('gives community a real contingency line', () => {
    const lines = allocate(samples.community)
    expect(lines.find((l) => l.category === 'Contingency reserve')?.amount).toBeGreaterThan(0)
    expect(lines.some((l) => l.category === 'Buffer')).toBe(false)
  })
})
