import 'server-only'
import { randomBytes } from 'node:crypto'
import { env } from './env'
import type { PlanRepository } from './db/planRepository'
import { MemoryRepository } from './db/memoryRepository'
import { SupabaseRepository } from './db/supabaseRepository'
import type { AiProvider } from './ai/provider'
import { GeminiProvider } from './ai/gemini'
import { FakeAi } from './ai/fake'

/** The providers a request uses. Built once from env; tests swap it with `setContainer`. */
export type Container = {
  repo: PlanRepository
  ai: AiProvider
  now: () => Date
  salt: string
  rateLimit: boolean
}

let current: Container | undefined
const g = globalThis as { __soireeMemoryRepo?: MemoryRepository }

function build(): Container {
  const e = env()
  const now = () => new Date()
  // The memory store survives dev hot reloads by living on globalThis.
  const repo =
    e.DB_PROVIDER === 'memory'
      ? (g.__soireeMemoryRepo ??= new MemoryRepository(now))
      : new SupabaseRepository(e.SUPABASE_URL ?? '', e.SUPABASE_SECRET_KEY ?? '')
  const ai =
    e.AI_PROVIDER === 'fake'
      ? new FakeAi()
      : new GeminiProvider(e.GEMINI_API_KEY ?? '', e.GEMINI_MODEL ?? '')
  return {
    repo,
    ai,
    now,
    salt: e.RATE_LIMIT_SALT ?? randomBytes(16).toString('hex'),
    rateLimit: e.RATE_LIMIT_ENABLED,
  }
}

/** The current container, built on first use. */
export function container(): Container {
  return (current ??= build())
}

/** Replace the container (tests). Pass nothing to rebuild from env on next use. */
export function setContainer(c?: Container) {
  current = c
}
