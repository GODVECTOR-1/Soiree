import 'server-only'
import { PlanVersion, type NewVendor, type VendorPatch } from '@/lib/schemas'
import { totalCheck } from '@/lib/domain/allocate'
import { allTasks } from '@/lib/domain/timeline'
import { customVendor, MAX_CUSTOM_VENDORS, patchVendor, withEstimates } from '@/lib/domain/vendors'
import { CAS_RETRIES } from '../constants'
import type { Container } from '../container'
import type { PlanRecord, StoredVersion, VersionPatch } from '../db/planRepository'
import { errors } from '../http/errors'
import { reload } from './shared'

/**
 * Change the CURRENT version with compare-and-set on `rev`: on a miss, re-read and re-apply (3 tries), then 409.
 * `change` may throw (unknown id, bad allocation) and is re-run against fresh data on every attempt.
 */
export async function editCurrent(c: Container, plan: PlanRecord, change: (v: StoredVersion) => VersionPatch): Promise<PlanVersion> {
  let p = plan
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const patch = change(p.current)
    const rev = await c.repo.updateVersion(p.id, p.current.version, p.current.rev, patch)
    if (rev !== null) return PlanVersion.parse({ ...p.current, ...patch })
    p = await reload(c, p.slug)
  }
  throw errors.conflict()
}

/** Mark a task done or not done. */
export const updateTask = (c: Container, plan: PlanRecord, taskId: string, done: boolean) =>
  editCurrent(c, plan, (v) => {
    if (!allTasks(v.phases).some((t) => t.id === taskId)) throw errors.itemNotFound('task')
    return { phases: v.phases.map((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)) })) }
  })

/** Update a vendor's status, notes, name, contact or quote (the schema whitelists the fields). */
export const updateVendor = (c: Container, plan: PlanRecord, vendorId: string, patch: VendorPatch) =>
  editCurrent(c, plan, (v) => {
    if (!v.vendors.some((x) => x.id === vendorId)) throw errors.itemNotFound('vendor')
    return { vendors: v.vendors.map((x) => (x.id === vendorId ? patchVendor(x, patch) : x)) }
  })

/** Add the user's own vendor, for example a second caterer to compare quotes. */
export const addVendor = (c: Container, plan: PlanRecord, body: NewVendor) =>
  editCurrent(c, plan, (v) => {
    if (v.vendors.filter((x) => x.custom).length >= MAX_CUSTOM_VENDORS)
      throw errors.unsupported(`You can add up to ${MAX_CUSTOM_VENDORS} vendors to a plan.`)
    return { vendors: [...v.vendors, customVendor(v, body.category, body.name)] }
  })

/** Remove a vendor the user added. The generated checklist items stay. */
export const removeVendor = (c: Container, plan: PlanRecord, vendorId: string) =>
  editCurrent(c, plan, (v) => {
    const target = v.vendors.find((x) => x.id === vendorId)
    if (!target) throw errors.itemNotFound('vendor')
    if (!target.custom) throw errors.unsupported('Only vendors you added can be removed.')
    return { vendors: v.vendors.filter((x) => x.id !== vendorId) }
  })

/** Save or unsave an idea. */
export const updateIdea = (c: Container, plan: PlanRecord, ideaId: string, saved: boolean) =>
  editCurrent(c, plan, (v) => {
    if (!v.ideas.some((i) => i.id === ideaId)) throw errors.itemNotFound('idea')
    return { ideas: v.ideas.map((i) => (i.id === ideaId ? { ...i, saved } : i)) }
  })

/** Manual allocation: every id must exist and lines must add up to the budget exactly. Re-derives shares and estimates. */
export const saveBudget = (c: Container, plan: PlanRecord, amounts: Record<string, number>) =>
  editCurrent(c, plan, (v) => {
    if (Object.keys(amounts).some((id) => !v.lines.some((l) => l.id === id))) throw errors.unsupported('One of those budget lines is not in this plan.')
    const next = withEstimates({ ...v, lines: v.lines.map((l) => ({ ...l, amount: amounts[l.id] ?? l.amount })) })
    if (!totalCheck(next.lines, next.budgetTotal).ok) throw errors.unsupported('Allocations must add up to the budget')
    return { lines: next.lines, vendors: next.vendors }
  })
