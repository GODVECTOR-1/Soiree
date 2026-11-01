import { describe, expect, it } from 'vitest'
import { categories } from '../../lib/categories'
import { addDays, dateParts, daysBetween, money, shortDate } from '../../lib/format'
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
    expect(money(1500.4, 'EUR')).toBe('€1,500')
    expect(money(0, 'GBP')).toBe('£0')
  })
})

describe('dates', () => {
  it('reads ISO dates the same way in every timezone', () => {
    expect(dateParts('2027-02-14')).toEqual({
      weekday: 'Sunday',
      month: 'February',
      day: 14,
      year: 2027,
    })
    expect(shortDate('2027-02-14')).toBe('14 Feb 2027')
  })

  it('adds days across months, years and leap days, and counts between dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(daysBetween('2026-11-01', '2027-02-14')).toBe(105)
    expect(daysBetween('2027-02-14', '2026-11-01')).toBe(-105)
  })
})

describe('templates', () => {
  it('sum to 100 and use the wizard labels', () => {
    for (const [type, tpl] of Object.entries(budgetTemplates)) {
      expect(sum(tpl.map((t) => t.share))).toBe(100)
      // Every category, then a Buffer line (community budgets already end in a contingency reserve).
      const cats = categories[type as PlanInput['eventType']]
      expect(tpl.map((t) => t.label)).toEqual(type === 'community' ? cats : [...cats, 'Buffer'])
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
    expect(after.version.phases.flatMap((p) => p.tasks).find((t) => t.id === taskId)?.done).toBe(
      true,
    )
    expect(after.version.vendors.find((x) => x.id === vendorId)?.status).toBe('booked')
    expect(after.input.totalBudget).toBe(240000)
  })

  it('gives community a real contingency line', () => {
    const lines = allocate(samples.community)
    expect(lines.find((l) => l.category === 'Contingency reserve')?.amount).toBeGreaterThan(0)
    expect(lines.some((l) => l.category === 'Buffer')).toBe(false)
  })
})
