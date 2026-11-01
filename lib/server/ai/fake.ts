import 'server-only'
import type { AiTask } from '../constants'
import { buildIdeas } from '@/lib/domain/ideas'
import { money } from '@/lib/format'
import type { Currency, EventType } from '@/lib/schemas'
import { generateValidated, type AiProvider, type AiRequest } from './provider'

type Json = Record<string, unknown>
export type FakeContext = { facts: Json; data: Json; attempt: number }
export type FakeHandler = (ctx: FakeContext) => unknown

const block = (user: string, tag: string): Json => {
  const m = new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(user)
  return m?.[1] ? (JSON.parse(m[1]) as Json) : {}
}

type LineFact = { id: string; category: string; amount?: number; sharePct?: number; baselineSharePct?: number }

/** Grounded keyword answer: enough for keyless dev and e2e, built only from the facts. */
function answer(facts: Json, question: string) {
  const lines = (facts.lines as LineFact[] | undefined) ?? []
  const hit = lines.find((l) => question.toLowerCase().includes(l.category.toLowerCase().split(' ')[0] ?? '~'))
  if (!hit) return { answer: 'I can answer questions about your budget, timeline, vendors and ideas. Try asking about one of your budget lines, or run a what-if.', references: [] }
  const cur = (facts.currency as Currency | undefined) ?? 'INR'
  return {
    answer: `${hit.category} has ${money(hit.amount ?? 0, cur)}, which is ${hit.sharePct ?? 0}% of your budget.`,
    references: [{ kind: 'budget', id: hit.id, label: hit.category }],
  }
}

function mapCustom(text: string) {
  const n = Number(/-?\d+/.exec(text)?.[0] ?? NaN)
  if (/venue/i.test(text) && /cancel/i.test(text)) return { kind: 'venue_cancelled' }
  if (/budget/i.test(text) && Number.isFinite(n)) return { kind: 'budget_change', value: /cut|less|lower|reduce|down/i.test(text) ? -Math.abs(n) : n }
  if (/guest/i.test(text) && Number.isFinite(n)) return { kind: 'guest_change', value: n }
  if (/(postpone|move|delay).*(day|week)/i.test(text) && Number.isFinite(n)) return { kind: 'date_change', value: /week/i.test(text) ? n * 7 : n }
  return { kind: 'unsupported' }
}

const defaults: Record<AiTask, FakeHandler> = {
  allocation_review: ({ facts }) => ({
    lines: ((facts.lines as LineFact[] | undefined) ?? []).map((l) => ({ id: l.id, sharePct: l.baselineSharePct, rationale: '', tradeoffNote: '' })),
  }),
  timeline: () => ({ renames: [], additions: [] }),
  vendor_questions: () => ({ vendors: [] }),
  ideas: ({ facts }) => ({
    ideas: buildIdeas({ eventType: facts.eventType as EventType, priorities: (facts.priorities as string[] | undefined) ?? [] }).map(
      ({ kind, title, blurb, fitsPriority }) => ({ kind, title, blurb, fitsPriority }),
    ),
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
      return JSON.stringify(await handler({ facts: block(user, 'facts'), data: block(user, 'user_data'), attempt }))
    })
  }
}
