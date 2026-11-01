import { TaskPatch } from '@/lib/schemas'
import { withHandler } from '@/lib/server/http/handler'
import { updateTask } from '@/lib/server/services/editPlan'

export const runtime = 'nodejs'
export const maxDuration = 60

export const PATCH = withHandler({ name: 'plans.task', limit: 'edit', auth: true, body: TaskPatch }, async ({ c, plan, params, body }) => {
  await updateTask(c, plan, params.taskId ?? '', body.done)
  return null
})
