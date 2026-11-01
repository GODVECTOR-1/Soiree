import 'server-only'
import type { Idea } from '@/lib/schemas'
import type { Container } from '../container'
import type { PlanRecord } from '../db/planRepository'
import { spendQuota } from '../security/rateLimit'
import { editCurrent } from './editPlan'
import { generateIdeas } from './generate'

/** Fresh ideas, keeping every saved one. Stored in the current version. 502 when the assistant is unavailable. */
export async function regenerateIdeas(c: Container, plan: PlanRecord, feedback?: string): Promise<Idea[]> {
  await spendQuota(c, plan.id, 'regenerate')
  const fresh = await generateIdeas(c, plan.input, feedback, plan.current.ideas.map((i) => i.title))
  const version = await editCurrent(c, plan, (v) => {
    const saved = v.ideas.filter((i) => i.saved)
    const taken = new Set(saved.map((i) => i.title.toLowerCase()))
    return { ideas: [...saved, ...fresh.filter((i) => !taken.has(i.title.toLowerCase()))] }
  })
  return version.ideas
}
