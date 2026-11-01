import { VendorPatch } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { removeVendor, updateVendor } from '@/lib/server/services/editPlan'

export const runtime = 'nodejs'
export const maxDuration = 60

export const PATCH = withHandler({ name: 'plans.vendor', limit: 'edit', auth: true, body: VendorPatch }, async ({ c, plan, params, body }) => {
  await updateVendor(c, plan, params.vendorId ?? '', body)
  return null
})

export const DELETE = withHandler({ name: 'plans.vendor.remove', limit: 'edit', auth: true }, async ({ c, plan, params }) => {
  await removeVendor(c, plan, params.vendorId ?? '')
  return null
})
