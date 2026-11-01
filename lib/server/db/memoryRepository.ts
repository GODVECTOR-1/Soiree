import 'server-only'
import { randomUUID } from 'node:crypto'
import type { InputPatch, PlanInput, PlanVersion } from '@/lib/schemas'
import type {
  ApplyOutcome,
  Draft,
  MergedProgress,
  NewPlan,
  PlanRecord,
  PlanRepository,
  VersionPatch,
} from './planRepository'

type VersionRow = { v: PlanVersion; rev: number; applied: boolean; inputPatch: InputPatch | null }
type PlanRow = {
  id: string
  slug: string
  tokenHash: string
  input: PlanInput
  current: number
  expiresAt: Date
  versions: Map<number, VersionRow>
}

const clone = <T>(x: T): T => structuredClone(x)

/**
 * In-memory twin of the Supabase repository with the same semantics (expiry, one draft, CAS, atomic apply).
 * Used for keyless dev (`DB_PROVIDER=memory`, resets on restart) and every test.
 */
export class MemoryRepository implements PlanRepository {
  private plans = new Map<string, PlanRow>()
  private rates = new Map<string, number>()

  constructor(private now: () => Date = () => new Date()) {}

  private byId(id: string) {
    for (const p of this.plans.values()) if (p.id === id) return p
    return undefined
  }

  async create(p: NewPlan) {
    if (this.plans.has(p.slug)) throw new Error('duplicate slug')
    const versions = new Map([
      [p.version.version, { v: clone(p.version), rev: 1, applied: true, inputPatch: null }],
    ])
    this.plans.set(p.slug, {
      id: randomUUID(),
      slug: p.slug,
      tokenHash: p.tokenHash,
      input: clone(p.input),
      current: p.version.version,
      expiresAt: p.expiresAt,
      versions,
    })
  }

  async get(slug: string): Promise<PlanRecord | null> {
    const p = this.plans.get(slug)
    const cur = p?.versions.get(p.current)
    if (!p || !cur || p.expiresAt <= this.now()) return null
    const history = [...p.versions.values()]
      .filter((r) => r.applied)
      .sort((a, b) => a.v.version - b.v.version)
      .map((r) => ({ version: r.v.version, createdAt: r.v.createdAt, scenario: r.v.scenario }))
    return clone({
      id: p.id,
      slug: p.slug,
      tokenHash: p.tokenHash,
      input: p.input,
      current: { ...cur.v, rev: cur.rev },
      history,
    })
  }

  async getDraft(planId: string, version: number): Promise<Draft | null> {
    const row = this.byId(planId)?.versions.get(version)
    return row && !row.applied
      ? clone({ version: { ...row.v, rev: row.rev }, inputPatch: row.inputPatch })
      : null
  }

  async replaceDraft(planId: string, draft: PlanVersion, inputPatch: InputPatch) {
    const p = this.byId(planId)
    if (!p) throw new Error('plan missing')
    await this.deleteDraft(planId)
    if (p.versions.has(draft.version)) throw new Error('duplicate version')
    p.versions.set(draft.version, {
      v: clone(draft),
      rev: 1,
      applied: false,
      inputPatch: clone(inputPatch),
    })
  }

  async deleteDraft(planId: string) {
    const p = this.byId(planId)
    for (const [n, r] of p?.versions ?? []) if (!r.applied) p?.versions.delete(n)
  }

  async updateVersion(planId: string, version: number, expectedRev: number, patch: VersionPatch) {
    const row = this.byId(planId)?.versions.get(version)
    if (!row || row.rev !== expectedRev) return null
    row.v = { ...row.v, ...clone(patch) }
    return ++row.rev
  }

  async applyVersion(
    planId: string,
    version: number,
    expectedRev: number,
    merged: MergedProgress,
  ): Promise<ApplyOutcome> {
    const p = this.byId(planId)
    if (!p) return 'no_draft'
    if (p.current === version) return 'already_applied'
    const cur = p.versions.get(p.current)
    if (!cur || cur.rev !== expectedRev) return 'stale'
    const draft = p.versions.get(version)
    if (!draft || draft.applied) return 'no_draft'
    draft.applied = true
    draft.rev++
    draft.v = { ...draft.v, ...clone(merged) }
    cur.rev++ // a concurrent edit on the old current version now fails its CAS instead of landing on a stale row
    p.current = version
    p.input = { ...p.input, ...(draft.inputPatch ?? {}) }
    return 'applied'
  }

  async incrementRate(key: string, windowStart: Date) {
    const k = `${key}@${windowStart.getTime()}`
    const n = (this.rates.get(k) ?? 0) + 1
    this.rates.set(k, n)
    return n
  }

  async cleanup() {
    const now = this.now()
    let plans = 0
    for (const [slug, p] of this.plans) {
      if (p.expiresAt > now) continue
      this.plans.delete(slug)
      plans++
    }
    const live = new Set([...this.plans.values()].map((p) => p.id))
    let rateRows = 0
    for (const k of this.rates.keys()) {
      const [key = '', at = '0'] = k.split('@')
      const stale =
        Number(at) > 0
          ? Number(at) < now.getTime() - 2 * 3600_000
          : !live.has(key.split(':')[1] ?? '')
      if (!stale) continue
      this.rates.delete(k)
      rateRows++
    }
    return { plans, rateRows }
  }
}
