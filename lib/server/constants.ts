import 'server-only'

/** Request bodies above this are rejected with 413. */
export const BODY_LIMIT_BYTES = 16 * 1024

/** Plans expire (404, then deleted by the cleanup cron) this many days after creation. */
export const PLAN_TTL_DAYS = 90

/** Per-IP requests per hour, keyed by endpoint group. */
export const IP_LIMITS = { create: 8, whatif: 20, regenerate: 10, ask: 20, read: 300, edit: 600 } as const
export type IpLimitKey = keyof typeof IP_LIMITS
export const IP_WINDOW_SEC = 3600

/** Lifetime per-plan quotas (fixed epoch window), protecting the Gemini quota. */
export const PLAN_QUOTAS = { whatif: 10, regenerate: 10, ask: 40 } as const
export type PlanQuotaKey = keyof typeof PLAN_QUOTAS
export const QUOTA_EPOCH = new Date(0)

/** Compare-and-set attempts before a concurrent edit returns 409. */
export const CAS_RETRIES = 3

export const AI_TIMEOUT_MS = 25_000

/** Time a request may spend on AI calls: under Vercel's 60 s limit, with room left for storage and the response. */
export const REQUEST_BUDGET_MS = 50_000
/** Time kept back from the budget so a fallback can still be stored and returned. */
export const AI_RESERVE_MS = 2_000

/** Output token cap and temperature per AI task. */
export const AI_BUDGETS = {
  allocation_review: { maxOutputTokens: 900, temperature: 0.2 },
  timeline: { maxOutputTokens: 700, temperature: 0.3 },
  vendor_questions: { maxOutputTokens: 600, temperature: 0.3 },
  ideas: { maxOutputTokens: 1500, temperature: 0.8 },
  narrative: { maxOutputTokens: 250, temperature: 0.3 },
  ask: { maxOutputTokens: 450, temperature: 0.2 },
  custom_mapping: { maxOutputTokens: 150, temperature: 0.1 },
} as const
export type AiTask = keyof typeof AI_BUDGETS

/** Max characters of plan JSON sent as context to the Ask assistant. */
export const ASK_CONTEXT_CHARS = 6000

/** Demo plans are dated this many days from today so they never go stale. */
export const DEMO_DAYS_OUT = { wedding: 105, birthday: 37, community: 83 } as const
