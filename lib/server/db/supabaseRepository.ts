import 'server-only'
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import type { InputPatch, PlanVersion } from '@/lib/schemas'
import type {
  ApplyOutcome,
  Draft,
  MergedProgress,
  NewPlan,
  PlanRecord,
  PlanRepository,
  VersionPatch,
} from './planRepository'
import { toInputPatch, toRecord, toRow, toVersion } from './mappers'

const UNIQUE_VIOLATION = '23505'

function check<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error)
    throw Object.assign(new Error(`db: ${res.error.message}`), { code: res.error.code })
  return res.data
}

function required<T>(res: { data: T; error: PostgrestError | null }): NonNullable<T> {
  const data = check(res)
  if (data === null || data === undefined) throw new Error('db: no row returned')
  return data
}

/** Supabase implementation. Uses the secret key, so it must only ever run on the server; RLS blocks everyone else. */
export class SupabaseRepository implements PlanRepository {
  private db: SupabaseClient

  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async create(p: NewPlan) {
    const plan = required(
      await this.db
        .from('plans')
        .insert({
          slug: p.slug,
          edit_token_hash: p.tokenHash,
          event_type: p.input.eventType,
          input: p.input,
          current_version: p.version.version,
          expires_at: p.expiresAt.toISOString(),
        })
        .select('id')
        .single(),
    )
    const res = await this.db
      .from('plan_versions')
      .insert({ ...toRow(plan.id, p.version), is_applied: true })
    if (res.error) {
      await this.db.from('plans').delete().eq('id', plan.id)
      check(res)
    }
  }

  async get(slug: string): Promise<PlanRecord | null> {
    const data = check(await this.db.rpc('get_plan', { p_slug: slug }))
    return data ? toRecord(data) : null
  }

  async getDraft(planId: string, version: number): Promise<Draft | null> {
    const row = check(
      await this.db
        .from('plan_versions')
        .select('*')
        .eq('plan_id', planId)
        .eq('version', version)
        .eq('is_applied', false)
        .maybeSingle(),
    )
    return row ? { version: toVersion(row), inputPatch: toInputPatch(row) } : null
  }

  async replaceDraft(planId: string, draft: PlanVersion, inputPatch: InputPatch) {
    for (let attempt = 0; ; attempt++) {
      await this.deleteDraft(planId)
      const res = await this.db
        .from('plan_versions')
        .insert({ ...toRow(planId, draft), is_applied: false, input_patch: inputPatch })
      if (!res.error) return
      if (res.error.code !== UNIQUE_VIOLATION || attempt > 0) check(res)
    }
  }

  async deleteDraft(planId: string) {
    check(
      await this.db.from('plan_versions').delete().eq('plan_id', planId).eq('is_applied', false),
    )
  }

  async updateVersion(planId: string, version: number, expectedRev: number, patch: VersionPatch) {
    const cols = {
      ...(patch.budgetTotal !== undefined && { budget_total: patch.budgetTotal }),
      ...(patch.lines && { lines: patch.lines }),
      ...(patch.phases && { phases: patch.phases }),
      ...(patch.vendors && { vendors: patch.vendors }),
      ...(patch.ideas && { ideas: patch.ideas }),
    }
    const rows = required(
      await this.db
        .from('plan_versions')
        .update({ ...cols, rev: expectedRev + 1 })
        .eq('plan_id', planId)
        .eq('version', version)
        .eq('rev', expectedRev)
        .select('rev'),
    )
    return rows.length ? expectedRev + 1 : null
  }

  async applyVersion(
    planId: string,
    version: number,
    expectedRev: number,
    m: MergedProgress,
  ): Promise<ApplyOutcome> {
    return check(
      await this.db.rpc('apply_version', {
        p_plan_id: planId,
        p_version: version,
        p_expected_rev: expectedRev,
        p_phases: m.phases,
        p_vendors: m.vendors,
        p_ideas: m.ideas,
      }),
    ) as ApplyOutcome
  }

  async incrementRate(key: string, windowStart: Date) {
    return Number(
      check(
        await this.db.rpc('increment_rate_limit', {
          p_key: key,
          p_window: windowStart.toISOString(),
        }),
      ),
    )
  }

  async cleanup() {
    const r = check(await this.db.rpc('cleanup_expired')) as { plans: number; rateRows: number }
    return { plans: Number(r.plans), rateRows: Number(r.rateRows) }
  }
}
