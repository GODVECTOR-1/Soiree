import 'server-only'
import type { HistoryItem, InputPatch, PlanInput, PlanVersion } from '@/lib/schemas'

/** A stored version plus its compare-and-set revision. */
export type StoredVersion = PlanVersion & { rev: number }

/** Everything one request needs about a plan, loaded in one query. `tokenHash` never leaves the server. */
export type PlanRecord = {
  id: string
  slug: string
  tokenHash: string
  input: PlanInput
  current: StoredVersion
  history: HistoryItem[]
}

export type NewPlan = {
  slug: string
  tokenHash: string
  input: PlanInput
  version: PlanVersion
  expiresAt: Date
}
export type VersionPatch = Partial<
  Pick<PlanVersion, 'budgetTotal' | 'lines' | 'phases' | 'vendors' | 'ideas'>
>
export type MergedProgress = Pick<PlanVersion, 'phases' | 'vendors' | 'ideas'>
export type ApplyOutcome = 'applied' | 'already_applied' | 'stale' | 'no_draft'
export type Draft = { version: StoredVersion; inputPatch: InputPatch | null }

/** All plan storage goes through this interface (Supabase in production, in-memory for keyless dev and tests). */
export interface PlanRepository {
  /** Insert a plan with its first, applied version. */
  create(plan: NewPlan): Promise<void>
  /** The plan with its current version and history metadata; null when missing or expired. One query. */
  get(slug: string): Promise<PlanRecord | null>
  /** The unapplied draft with this version number, if any. */
  getDraft(planId: string, version: number): Promise<Draft | null>
  /** Delete any draft, then insert this one (retrying once on a unique violation). */
  replaceDraft(planId: string, draft: PlanVersion, inputPatch: InputPatch): Promise<void>
  /** Delete the draft, if any. Idempotent. */
  deleteDraft(planId: string): Promise<void>
  /** Compare-and-set on `rev`. Returns the new rev, or null when the version changed since it was read. */
  updateVersion(
    planId: string,
    version: number,
    expectedRev: number,
    patch: VersionPatch,
  ): Promise<number | null>
  /** Promote a draft atomically (see `apply_version` in the migration). */
  applyVersion(
    planId: string,
    version: number,
    expectedRev: number,
    merged: MergedProgress,
  ): Promise<ApplyOutcome>
  /** Increment and return the counter for a key in a fixed window. */
  incrementRate(key: string, windowStart: Date): Promise<number>
  /** Delete expired plans and stale rate-limit rows. */
  cleanup(): Promise<{ plans: number; rateRows: number }>
}
