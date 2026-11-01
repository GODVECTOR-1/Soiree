import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toInputPatch, toRecord, toRow, toVersion } from '@/lib/server/db/mappers'
import { toModelSchema } from '@/lib/server/ai/provider'
import { container, setContainer } from '@/lib/server/container'
import { resetEnv } from '@/lib/server/env'
import { MemoryRepository } from '@/lib/server/db/memoryRepository'
import { FakeAi } from '@/lib/server/ai/fake'
import { previewVersion } from '@/lib/domain/baseline'
import { samples } from '@/lib/schemas'

// The seams to Postgres and Gemini, checked without either: row mapping, the model's JSON Schema, and wiring by env.

const input = { ...samples.wedding, planningStart: '2026-11-01' }
const version = previewVersion(input, '2026-11-01')
const row = {
  ...toRow('plan-1', version),
  rev: 3,
  created_at: '2026-11-01T10:00:00Z',
  budget_total: String(version.budgetTotal),
  input_patch: null,
}

describe('Postgres row mapping', () => {
  it('round-trips a version through its row (Postgres numerics arrive as strings)', () => {
    expect(row).toMatchObject({ plan_id: 'plan-1', version: version.version, scenario: null })
    expect(toVersion(row)).toMatchObject({
      version: version.version,
      rev: 3,
      createdAt: '2026-11-01T10:00:00Z',
      budgetTotal: version.budgetTotal,
      lines: version.lines,
      phases: version.phases,
      vendors: version.vendors,
      ideas: version.ideas,
    })
  })

  it('fails loudly on schema drift instead of rendering garbage', () => {
    expect(() => toVersion({ ...row, lines: 'not an array' })).toThrow()
    expect(() => toRecord({ id: 'x' })).toThrow()
  })

  it('maps the get_plan result and a draft input patch', () => {
    const record = toRecord({
      id: 'plan-1',
      slug: 'abc',
      tokenHash: 'h',
      input,
      current: row,
      history: [{ version: 1, createdAt: '2026-11-01T10:00:00Z', scenario: null }],
    })
    expect(record).toMatchObject({ slug: 'abc', current: { rev: 3 }, history: [{ version: 1 }] })
    expect(toInputPatch(row)).toBeNull()
    expect(toInputPatch({ ...row, input_patch: { totalBudget: 1000 } })).toEqual({
      totalBudget: 1000,
    })
  })
})

describe('model JSON Schema', () => {
  it('keeps only keywords Gemini structured output supports; Zod still checks the rest', () => {
    const schema = toModelSchema(
      z.object({ title: z.string().min(2).max(5), tags: z.array(z.number()).max(3) }),
    ) as {
      properties: { title: Record<string, unknown>; tags: Record<string, unknown> }
      $schema?: string
    }
    expect(schema.$schema).toBeUndefined()
    expect(schema.properties.title).toEqual({ type: 'string' })
    expect(schema.properties.tags).toMatchObject({
      type: 'array',
      maxItems: 3,
      items: { type: 'number' },
    })
  })
})

describe('container', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetEnv()
    setContainer()
  })

  it('builds the keyless providers from env, once', () => {
    vi.stubEnv('RATE_LIMIT_SALT', '')
    resetEnv()
    setContainer()
    const c = container()
    expect(c.repo).toBeInstanceOf(MemoryRepository)
    expect(c.ai).toBeInstanceOf(FakeAi)
    expect(c.salt).toMatch(/^[0-9a-f]{32}$/) // a random per-process salt when none is configured
    expect(container()).toBe(c)
  })
})
