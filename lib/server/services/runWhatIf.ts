import 'server-only'
import type { PlanInput, ScenarioInput, WhatIfResult } from '@/lib/schemas'
import { buildDiff } from '@/lib/domain/diff'
import { runScenario, type Scenario } from '@/lib/domain/scenarios'
import { priorityError } from '@/lib/domain/templates'
import { withEstimates } from '@/lib/domain/vendors'
import { addDays } from '@/lib/format'
import type { Container } from '../container'
import type { PlanRecord } from '../db/planRepository'
import { customMappingPrompt } from '../ai/prompts/assistant'
import { errors } from '../http/errors'
import { spendQuota } from '../security/rateLimit'
import { reviewAllocation, writeNarrative } from './generate'
import { isoDay } from './shared'

type Mapped = Omit<ScenarioInput, 'kind'> & { kind: Exclude<ScenarioInput['kind'], 'custom'> }

const whole = (v: number | undefined, min: number, max: number, message: string) => {
  if (v === undefined || !Number.isInteger(v) || v < min || v > max || v === 0)
    throw errors.validation(message)
  return v
}

/** Validate a scenario's numbers and turn it into a domain scenario. 400 for bad values, 422 for unsupported. */
export function toScenario(input: PlanInput, s: Mapped, today: string): Scenario {
  switch (s.kind) {
    case 'budget_change':
      return {
        kind: 'budget_change',
        value: whole(s.value, -50, 100, 'Budget changes must be a whole percent from -50 to 100.'),
      }
    case 'guest_change': {
      const guests = whole(s.value, 1, 5000, 'Guest count must be between 1 and 5,000.')
      if (guests === input.guestCount) throw errors.validation('That is already your guest count.')
      return { kind: 'guest_change', guests }
    }
    case 'venue_cancelled':
      if (input.eventType === 'community')
        throw errors.unsupported("That scenario doesn't apply to this event type.")
      return { kind: 'venue_cancelled', today }
    case 'date_change': {
      const days = whole(s.value, -365, 365, 'Move the date by 1 to 365 days.')
      const date = addDays(input.date, days)
      if (date < today) throw errors.validation('The new date must be today or later.')
      if (date < input.planningStart)
        throw errors.validation('The new date must be after planning starts.')
      return { kind: 'date_change', days, today }
    }
    case 'reprioritize': {
      const problem = priorityError(input.eventType, s.priorities ?? [])
      if (problem) throw errors.validation(problem)
      return { kind: 'reprioritize', priorities: s.priorities ?? [] }
    }
  }
}

async function mapCustom(
  c: Container,
  input: PlanInput,
  text: string | undefined,
  today: string,
): Promise<Mapped> {
  if (!text?.trim()) throw errors.validation('Describe the change you want to try.')
  const out = await c.ai.generateJson(customMappingPrompt(input, text, today))
  if (out.kind === 'unsupported')
    throw errors.unsupported("We couldn't turn that into a scenario. Try one of the presets.")
  return { kind: out.kind, value: out.value, priorities: out.priorities }
}

/**
 * Compute a scenario in code, let the model write only the narrative, and store it as the plan's one draft
 * (replacing any previous draft). `GET` never returns drafts.
 */
export async function runWhatIf(
  c: Container,
  plan: PlanRecord,
  s: ScenarioInput,
): Promise<WhatIfResult> {
  const now = c.now()
  const today = isoDay(now)
  let scenario: Scenario
  if (s.kind === 'custom') {
    await spendQuota(c, plan.id, 'whatif')
    scenario = toScenario(plan.input, await mapCustom(c, plan.input, s.text, today), today)
  } else {
    scenario = toScenario(plan.input, { ...s, kind: s.kind }, today)
    await spendQuota(c, plan.id, 'whatif')
  }

  const cur = plan.current
  const result = runScenario(plan.input, cur, scenario)
  let draft = result.draft
  if (scenario.kind === 'reprioritize') {
    const input = { ...plan.input, priorities: scenario.priorities, totalBudget: cur.budgetTotal }
    draft = withEstimates({
      ...draft,
      lines: await reviewAllocation(c, input, draft.lines).catch(() => draft.lines),
    })
  }
  const diff = buildDiff(cur, draft)
  const facts = {
    scenario: draft.scenario,
    budgetFrom: diff.budgetFrom,
    budgetTo: diff.budgetTo,
    rows: diff.rows,
    floorsBroken: result.floorsBroken,
  }
  draft = {
    ...draft,
    createdAt: now.toISOString(),
    narrative: await writeNarrative(c, facts, draft.narrative ?? ''),
  }

  await c.repo.replaceDraft(plan.id, draft, result.inputPatch)
  return { draft, diff, inputPatch: result.inputPatch }
}

/** Delete the plan's draft. Idempotent. */
export const discardDraft = (c: Container, plan: PlanRecord) => c.repo.deleteDraft(plan.id)
