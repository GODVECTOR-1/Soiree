import 'server-only'
import { z } from 'zod'
import type { AskRequest, PlanInput } from '@/lib/schemas'
import { categories } from '@/lib/categories'
import { request } from './system'

/** 2-3 sentence narrative for a scenario whose numbers code already computed. */
export function narrativePrompt(facts: object) {
  return request(
    'narrative',
    'Explain this budget change to the planner in 2 or 3 short sentences: what changed, what stayed protected, and what gave way. Use only numbers from the facts.',
    facts,
    {},
    z.object({ narrative: z.string().min(10).max(400) }),
  )
}

/** Grounded Q&A: answer only from plan data; references point at plan items by id. */
export function askPrompt(facts: object, input: PlanInput, ask: AskRequest) {
  return request(
    'ask',
    "Answer the planner's latest question using only the plan facts. If the plan does not contain the answer, say so plainly and suggest trying a what-if scenario. Keep it under 120 words. Add references to the budget lines, tasks, vendors or ideas you used, by their exact id.",
    facts,
    {
      question: ask.question,
      history: ask.history,
      notes: input.notes ?? '',
      vibes: input.vibes,
      diet: input.diet,
    },
    z.object({
      answer: z.string().min(1).max(900),
      references: z
        .array(
          z.object({
            kind: z.enum(['budget', 'task', 'vendor', 'idea']),
            id: z.string(),
            label: z.string().max(80),
          }),
        )
        .max(6),
    }),
  )
}

const MAPPED = [
  'budget_change',
  'guest_change',
  'venue_cancelled',
  'date_change',
  'reprioritize',
  'unsupported',
] as const

/** Map free text to a supported scenario, or mark it unsupported. */
export function customMappingPrompt(input: PlanInput, text: string, today: string) {
  const facts = {
    eventType: input.eventType,
    guestCount: input.guestCount,
    totalBudget: input.totalBudget,
    date: input.date,
    today,
    categories: categories[input.eventType],
    rules: {
      budget_change: 'value is the percent change, from -50 to 100',
      guest_change: 'value is the new total guest count, from 1 to 5000',
      date_change: 'value is the number of days to move the event (positive is later)',
      reprioritize: 'priorities are 1 to 3 categories from the list, most important first',
      venue_cancelled: 'no value',
      unsupported: 'anything else',
    },
  }
  return request(
    'custom_mapping',
    'Turn the user\'s request into one supported scenario kind with its value or priorities, following the rules. If it does not fit, return kind "unsupported".',
    facts,
    { request: text },
    z.object({
      kind: z.enum(MAPPED),
      value: z.number().optional(),
      priorities: z.array(z.string()).max(3).optional(),
    }),
  )
}
