import type { PlanInput, PlanVersion } from '../schemas'
import { allocate } from './allocate'
import { buildPhases } from './timeline'
import { buildVendors } from './vendors'
import { buildIdeas } from './ideas'

/** The templated narrative for a first version. Labels already contain "and", so lists use commas. */
export const baselineNarrative = (input: PlanInput) =>
  `Protected first: ${input.priorities.join(', ')}. Everything else stays flexible, with room held back for surprises.`

/** A full, deterministic first version of the plan: the fallback for every AI section. */
export function previewVersion(input: PlanInput, today: string): PlanVersion {
  const lines = allocate(input)
  return {
    version: 1,
    createdAt: today,
    budgetTotal: input.totalBudget,
    lines,
    phases: buildPhases(input, today),
    vendors: buildVendors(input, lines),
    ideas: buildIdeas(input),
    narrative: baselineNarrative(input),
  }
}
