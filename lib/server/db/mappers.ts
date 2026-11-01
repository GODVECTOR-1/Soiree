import 'server-only'
import { z } from 'zod'
import { HistoryItem, InputPatch, PlanInput, PlanVersion } from '@/lib/schemas'
import type { PlanRecord, StoredVersion } from './planRepository'

const nullable = <T extends z.ZodType>(s: T) => s.nullish().transform((v) => v ?? undefined)

/** A `plan_versions` row as Postgres returns it. */
const VersionRow = z.object({
  version: z.number().int(),
  rev: z.number().int(),
  created_at: z.string(),
  scenario: nullable(z.string()),
  budget_total: z.coerce.number(),
  lines: PlanVersion.shape.lines,
  phases: PlanVersion.shape.phases,
  vendors: PlanVersion.shape.vendors,
  ideas: PlanVersion.shape.ideas,
  narrative: nullable(z.string()),
  input_patch: InputPatch.nullish(),
})

/** Map a row to a domain version. Rows are parsed so schema drift fails loudly instead of rendering garbage. */
export function toVersion(row: unknown): StoredVersion {
  const r = VersionRow.parse(row)
  return {
    version: r.version, rev: r.rev, createdAt: r.created_at, scenario: r.scenario, budgetTotal: r.budget_total,
    lines: r.lines, phases: r.phases, vendors: r.vendors, ideas: r.ideas, narrative: r.narrative,
  }
}

export const toInputPatch = (row: unknown) => VersionRow.pick({ input_patch: true }).parse(row).input_patch ?? null

/** Map a domain version to insertable columns. */
export function toRow(planId: string, v: PlanVersion) {
  return {
    plan_id: planId, version: v.version, scenario: v.scenario ?? null, budget_total: v.budgetTotal,
    lines: v.lines, phases: v.phases, vendors: v.vendors, ideas: v.ideas, narrative: v.narrative ?? null,
  }
}

const RecordJson = z.object({
  id: z.string(),
  slug: z.string(),
  tokenHash: z.string(),
  input: PlanInput,
  current: z.unknown(),
  history: z.array(z.object({ version: z.number(), createdAt: z.string(), scenario: nullable(z.string()) })),
})

/** Map the `get_plan` RPC result to a record. */
export function toRecord(json: unknown): PlanRecord {
  const r = RecordJson.parse(json)
  return { ...r, current: toVersion(r.current), history: r.history.map((h) => HistoryItem.parse(h)) }
}
