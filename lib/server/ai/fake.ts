import 'server-only'
import type { AiTask } from '../constants'
import { buildIdeas } from '@/lib/domain/ideas'
import { money } from '@/lib/format'
import { z } from 'zod'
import { CURRENCIES, EVENT_TYPES } from '@/lib/schemas'
import { generateValidated, type AiProvider, type AiRequest } from './provider'

type Json = Record<string, unknown>
type FakeContext = { facts: Json; data: Json; attempt: number }
export type FakeHandler = (ctx: FakeContext) => unknown

const block = (user: string, tag: string): Json => {
  const m = new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(user)
  return m?.[1] ? z.record(z.string(), z.unknown()).parse(JSON.parse(m[1])) : {}
}

/** The fact fields the fake reads; anything missing falls back to a neutral default. */
const Facts = z.object({
  lines: z
    .array(
      z.object({
        id: z.string(),
        category: z.string(),
        amount: z.number().optional(),
        sharePct: z.number().optional(),
        baselineSharePct: z.number().optional(),
      }),
    )
    .catch([]),
  currency: z.enum(CURRENCIES).catch('INR'),
  eventType: z.enum(EVENT_TYPES).catch('wedding'),
  priorities: z.array(z.string()).catch([]),
})
const factsOf = (facts: Json) => Facts.parse(facts)

/** Grounded keyword answer: enough for keyless dev and e2e, built only from the facts. */
function answer(facts: Json, question: string) {
  const { lines, currency } = factsOf(facts)
  const hit = lines.find((l) =>
    question.toLowerCase().includes(l.category.toLowerCase().split(' ')[0] ?? '~'),
  )
  if (!hit)
    return {
      answer:
        'I can answer questions about your budget, timeline, vendors and ideas. Try asking about one of your budget lines, or run a what-if.',
      references: [],
    }
  return {
    answer: `${hit.category} has ${money(hit.amount ?? 0, currency)}, which is ${hit.sharePct ?? 0}% of your budget.`,
    references: [{ kind: 'budget', id: hit.id, label: hit.category }],
  }
}

function mapCustom(text: string) {
  const n = Number(/-?\d+/.exec(text)?.[0] ?? NaN)
  if (/venue/i.test(text) && /cancel/i.test(text)) return { kind: 'venue_cancelled' }
  if (!Number.isFinite(n)) return { kind: 'unsupported' } // every other scenario needs a number
  if (/budget/i.test(text))
    return {
      kind: 'budget_change',
      value: /cut|less|lower|reduce|down/i.test(text) ? -Math.abs(n) : n,
    }
  if (/guest/i.test(text)) return { kind: 'guest_change', value: n }
  if (/(postpone|move|delay).*(day|week)/i.test(text))
    return { kind: 'date_change', value: /week/i.test(text) ? n * 7 : n }
  return { kind: 'unsupported' }
}

const defaults: Record<AiTask, FakeHandler> = {
  allocation_review: ({ facts }) => ({
    lines: factsOf(facts).lines.map((l) => ({
      id: l.id,
      sharePct: l.baselineSharePct,
      rationale: '',
      tradeoffNote: '',
    })),
  }),
  timeline: () => ({ renames: [], additions: [] }),
  vendor_questions: () => ({ vendors: [] }),
  ideas: ({ facts }) => ({
    ideas: buildIdeas(factsOf(facts)).map(({ kind, title, blurb, fitsPriority }) => ({
      kind,
      title,
      blurb,
      fitsPriority,
    })),
  }),
  narrative: ({ facts }) => ({ narrative: facts.templateNarrative }),
  ask: ({ facts, data }) => answer(facts, String(data.question ?? '')),
  custom_mapping: ({ data }) => mapCustom(String(data.request ?? '')),
}

/**
 * Deterministic provider for keyless dev, e2e and tests. It goes through the same validate-and-retry policy as
 * Gemini, and tests override single tasks to simulate bad output or outages.
 */
export class FakeAi implements AiProvider {
  calls: { task: AiTask; user: string }[] = []

  constructor(private overrides: Partial<Record<AiTask, FakeHandler>> = {}) {}

  generateJson<T>(req: AiRequest<T>): Promise<T> {
    let attempt = 0
    return generateValidated(req, 'fake', async (user) => {
      attempt++
      this.calls.push({ task: req.task, user })
      const handler = this.overrides[req.task] ?? defaults[req.task]
      return JSON.stringify(
        await handler({ facts: block(user, 'facts'), data: block(user, 'user_data'), attempt }),
      )
    })
  }
}
