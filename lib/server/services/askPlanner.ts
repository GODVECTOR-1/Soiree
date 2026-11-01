import 'server-only'
import type { AskRequest, AskResponse, PlanInput } from '@/lib/schemas'
import { allTasks } from '@/lib/domain/timeline'
import { quoteCheck } from '@/lib/domain/vendors'
import { daysBetween } from '@/lib/format'
import { ASK_CONTEXT_CHARS } from '../constants'
import type { Container } from '../container'
import type { PlanRecord, StoredVersion } from '../db/planRepository'
import { askPrompt } from '../ai/prompts/assistant'
import { cleanOutput, numbersOk } from '../ai/guards'
import { spendQuota } from '../security/rateLimit'
import { isoDay } from './shared'

const UNSURE =
  'I could not answer that reliably from your plan. Open the Budget or Timeline tab for exact figures, or try a what-if.'

/** Compact plan facts for grounding, trimmed to about 6,000 characters (done tasks and extra ideas go first). */
function askFacts(input: PlanInput, v: StoredVersion, today: string) {
  const tasks = allTasks(v.phases)
  const facts = {
    today,
    date: input.date,
    daysToGo: daysBetween(today, input.date),
    guestCount: input.guestCount,
    currency: input.currency,
    budgetTotal: v.budgetTotal,
    priorities: input.priorities,
    lines: v.lines.map((l) => ({
      id: l.id,
      category: l.category,
      amount: l.amount,
      sharePct: l.sharePct,
      isPriority: l.isPriority,
    })),
    openTasks: tasks.filter((t) => !t.done).length,
    tasks: [...tasks.filter((t) => !t.done), ...tasks.filter((t) => t.done)].map((t) => ({
      id: t.id,
      title: t.title,
      due: t.dueLabel,
      done: t.done,
    })),
    bookedVendors: v.vendors.filter((x) => x.status === 'booked').length,
    // Names and quotes let the planner answer "is this quote OK?"; contact details never leave the plan.
    vendors: v.vendors.map((x) => ({
      id: x.id,
      category: x.category,
      name: x.name,
      status: x.status,
      estLow: x.estLow,
      estHigh: x.estHigh,
      quote: x.quote,
      quoteCheck: quoteCheck(x),
    })),
    ideas: v.ideas.map((i) => ({ id: i.id, kind: i.kind, title: i.title, saved: i.saved })),
  }
  while (
    JSON.stringify(facts).length > ASK_CONTEXT_CHARS &&
    (facts.tasks.length || facts.ideas.length)
  ) {
    if (facts.ideas.length > 4 || !facts.tasks.length) facts.ideas.pop()
    else facts.tasks.pop()
  }
  return facts
}

/** Grounded Q&A. Invented numbers swap the answer for a plain fallback; references to unknown ids are dropped. */
export async function askPlanner(
  c: Container,
  plan: PlanRecord,
  ask: AskRequest,
): Promise<AskResponse> {
  await spendQuota(c, plan.id, 'ask')
  const facts = askFacts(plan.input, plan.current, isoDay(c.now()))
  const out = await c.ai.generateJson(askPrompt(facts, plan.input, ask))
  const v = plan.current
  const known = {
    budget: new Set(v.lines.map((l) => l.id)),
    task: new Set(allTasks(v.phases).map((t) => t.id)),
    vendor: new Set(v.vendors.map((x) => x.id)),
    idea: new Set(v.ideas.map((i) => i.id)),
  }
  const answer = cleanOutput(out.answer, 900)
  const ok = answer && numbersOk(answer, facts)
  return {
    answer: ok ? answer : UNSURE,
    references: ok
      ? out.references
          .filter((r) => known[r.kind].has(r.id))
          .map((r) => ({ ...r, label: cleanOutput(r.label, 80) || r.id }))
      : [],
  }
}
