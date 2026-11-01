import { NewVendor } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { addVendor } from '@/lib/server/services/editPlan'

export const runtime = 'nodejs'
export const maxDuration = 60

export const POST = withHandler(
  { name: 'plans.vendor.add', limit: 'edit', auth: true, body: NewVendor },
  async ({ c, plan, body }) => Response.json(await addVendor(c, plan, body), { status: 201 }),
)
