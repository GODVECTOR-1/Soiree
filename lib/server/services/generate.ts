import 'server-only'
import { randomBytes } from 'node:crypto'
import type { BudgetLine, Idea, Phase, PlanInput, VendorItem } from '@/lib/schemas'
import { toLines } from '@/lib/domain/allocate'
import { allTasks, buildPhases } from '@/lib/domain/timeline'
import type { Container } from '../container'
import { cleanOutput, numbersOk } from '../ai/guards'
import {
  allocationReview,
  ideasPrompt,
  timelinePersonalization,
  vendorQuestionsPrompt,
} from '../ai/prompts/generation'
import { narrativePrompt } from '../ai/prompts/assistant'

// Each enricher returns AI-improved content or throws; callers fall back to the deterministic template.

/** Phase A: the model fine-tunes shares within guardrails (in the schema) and explains each line. */
export async function reviewAllocation(
  c: Container,
  input: PlanInput,
  baseline: BudgetLine[],
): Promise<BudgetLine[]> {
  const { req, facts } = allocationReview(input, baseline)
  const out = await c.ai.generateJson(req)
  const text = (s: string, max: number) => {
    const t = cleanOutput(s, max)
    return t && numbersOk(t, facts) ? t : undefined
  }
  const byId = new Map(out.lines.map((l) => [l.id, l]))
  const ordered = baseline.map((b) => byId.get(b.id))
  return toLines(
    input,
    ordered.map((l, i) => l?.sharePct ?? baseline[i]?.sharePct ?? 0),
    ordered.map((l) => ({
      rationale: l && text(l.rationale, 160),
      tradeoffNote: l && text(l.tradeoffNote, 100),
    })),
  )
}

/** Phase B: rename up to 8 tasks (ids kept) and add up to 6 from the notes. Skipped when there are no notes. */
export async function personalizeTimeline(
  c: Container,
  input: PlanInput,
  today: string,
  base: Phase[],
): Promise<Phase[]> {
  if (!input.notes?.trim()) return base
  const out = await c.ai.generateJson(timelinePersonalization(input, allTasks(base)))
  const renames = Object.fromEntries(
    out.renames.map((r) => [r.id, cleanOutput(r.title, 140)]).filter(([, t]) => t),
  )
  const additions = out.additions
    .map((a) => ({
      title: cleanOutput(a.title, 140),
      offsetDays: a.offsetDays,
      tags: a.tag ? [a.tag] : [],
    }))
    .filter((a) => a.title)
  return buildPhases(input, today, { renames, additions })
}

/** Phase B: tailored questions first, template questions after, at most 5. */
export async function tailorVendors(
  c: Container,
  input: PlanInput,
  vendors: VendorItem[],
): Promise<VendorItem[]> {
  const out = await c.ai.generateJson(vendorQuestionsPrompt(input, vendors))
  return vendors.map((v) => {
    const extra =
      out.vendors
        .find((x) => x.id === v.id)
        ?.questions.map((q) => cleanOutput(q, 160))
        .filter(Boolean) ?? []
    return { ...v, questionsToAsk: [...new Set([...extra, ...v.questionsToAsk])].slice(0, 5) }
  })
}

/** Phase B and regeneration: 12 ideas with server-side ids; `fitsPriority` kept only when it is a real priority. */
export async function generateIdeas(
  c: Container,
  input: PlanInput,
  feedback?: string,
  avoidTitles: string[] = [],
): Promise<Idea[]> {
  const out = await c.ai.generateJson(ideasPrompt(input, feedback, avoidTitles))
  return out.ideas
    .map((i) => ({
      id: `idea-${randomBytes(5).toString('hex')}`,
      kind: i.kind,
      title: cleanOutput(i.title, 80),
      blurb: cleanOutput(i.blurb, 240),
      fitsPriority:
        i.fitsPriority && input.priorities.includes(i.fitsPriority) ? i.fitsPriority : undefined,
      saved: false,
    }))
    .filter((i) => i.title && i.blurb)
}

/** The model rewrites a templated narrative; the number guard swaps any invented number for the template. */
export async function writeNarrative(
  c: Container,
  facts: object,
  fallback: string,
): Promise<string> {
  try {
    const out = await c.ai.generateJson(narrativePrompt({ ...facts, templateNarrative: fallback }))
    const text = cleanOutput(out.narrative, 400)
    return text && numbersOk(text, facts) ? text : fallback
  } catch {
    return fallback
  }
}
