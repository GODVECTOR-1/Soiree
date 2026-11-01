import type { Idea, PlanInput, PlanVersion, VendorPatch, WhatIfResult } from '../schemas'
import { allTasks } from './timeline'
import { customVendor, patchVendor, withEstimates } from './vendors'

/**
 * Every change the dashboard can make. The plan page is the single seam that turns these into API calls
 * (optimistic, rolled back on error), except `apply`, which waits for the server.
 */
export type PlanAction =
  | { type: 'task'; id: string }
  | { type: 'vendor'; id: string; patch: VendorPatch }
  | { type: 'vendor-add'; category: string; name?: string }
  | { type: 'vendor-remove'; id: string }
  | { type: 'idea'; id: string }
  | { type: 'ideas'; ideas: Idea[] }
  | { type: 'budget'; amounts: Record<string, number> }
  | { type: 'apply'; result: WhatIfResult }

/**
 * Keep progress made on `current` while the draft was open: task done flags, the user's vendor records (status,
 * notes, name, contact, quote) by id, vendors they added or removed since, and the current ideas (scenarios never
 * change ideas). New ids keep the draft's state. Estimate ranges are re-derived from the draft's lines.
 */
export function mergeProgress(current: PlanVersion, draft: PlanVersion): PlanVersion {
  const done = new Map(allTasks(current.phases).map((t) => [t.id, t.done]))
  const kept = draft.vendors.filter((d) => !d.custom || current.vendors.some((c) => c.id === d.id))
  const added = current.vendors.filter((c) => c.custom && !draft.vendors.some((d) => d.id === c.id))
  return withEstimates({
    ...draft,
    phases: draft.phases.map((p) => ({ ...p, tasks: p.tasks.map((t) => ({ ...t, done: done.get(t.id) ?? t.done })) })),
    vendors: [
      ...kept.map((d) => {
        const cur = current.vendors.find((c) => c.id === d.id)
        return cur ? { ...d, status: cur.status, notes: cur.notes, name: cur.name, contact: cur.contact, quote: cur.quote } : d
      }),
      ...added,
    ],
    ideas: current.ideas,
  })
}

/** Pure reducer: same inputs, same plan. */
export function applyAction(input: PlanInput, v: PlanVersion, a: PlanAction): { input: PlanInput; version: PlanVersion } {
  switch (a.type) {
    case 'task':
      return { input, version: { ...v, phases: v.phases.map((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === a.id ? { ...t, done: !t.done } : t)) })) } }
    case 'vendor':
      return { input, version: { ...v, vendors: v.vendors.map((x) => (x.id === a.id ? patchVendor(x, a.patch) : x)) } }
    case 'vendor-add':
      return { input, version: { ...v, vendors: [...v.vendors, customVendor(v, a.category, a.name)] } }
    case 'vendor-remove':
      return { input, version: { ...v, vendors: v.vendors.filter((x) => x.id !== a.id || !x.custom) } }
    case 'idea':
      return { input, version: { ...v, ideas: v.ideas.map((i) => (i.id === a.id ? { ...i, saved: !i.saved } : i)) } }
    case 'ideas':
      return { input, version: { ...v, ideas: a.ideas } }
    case 'budget':
      return { input, version: withEstimates({ ...v, lines: v.lines.map((l) => ({ ...l, amount: a.amounts[l.id] ?? l.amount })) }) }
    case 'apply':
      return { input: { ...input, ...a.result.inputPatch }, version: mergeProgress(v, a.result.draft) }
  }
}
