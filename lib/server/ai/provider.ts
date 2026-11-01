import 'server-only'
import { z } from 'zod'
import { AI_RESERVE_MS, type AiTask } from '../constants'
import { timeLeft } from '../deadline'
import { errors } from '../http/errors'
import { log } from '../log'

export type AiRequest<T> = {
  task: AiTask
  system: string
  user: string
  schema: z.ZodType<T>
  maxOutputTokens: number
  temperature: number
  timeoutMs: number
}

/** The model seam: Gemini in production, a deterministic fake for keyless dev and tests. */
export interface AiProvider {
  /** Structured JSON matching `schema`, re-validated with Zod; throws AppError 502 `AI_UNAVAILABLE` on failure. */
  generateJson<T>(req: AiRequest<T>): Promise<T>
}

const SUPPORTED = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
])

function trim(node: unknown, isMap = false): unknown {
  if (Array.isArray(node)) return node.map((n) => trim(n))
  if (!node || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) {
    if (isMap) out[k] = trim(v)
    else if (SUPPORTED.has(k)) out[k] = trim(v, k === 'properties' || k === '$defs')
  }
  return out
}

/** JSON Schema from Zod, trimmed to the keywords Gemini structured output supports. Zod still validates the rest. */
export const toModelSchema = (schema: z.ZodType) =>
  trim(z.toJSONSchema(schema, { unrepresentable: 'any' }))

/** The HTTP status a provider error carries, if any (a 429 means the quota is used up). */
function httpStatusOf(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null || !('status' in e)) return undefined
  return typeof e.status === 'number' ? e.status : undefined
}

/** How a failed model call is logged: unparseable JSON, a timeout, or any other error. */
function failureOutcome(e: unknown) {
  if (e instanceof SyntaxError) return 'invalid_json'
  return e instanceof Error && /abort|timeout/i.test(e.name + e.message) ? 'timeout' : 'error'
}

/**
 * Shared call policy for every provider: call, JSON-parse, Zod-validate; on a bad answer one retry with the problem
 * appended; then 502. Each attempt gets at most what is left of the request deadline; timeouts and 429s are not retried.
 * Logs task, model, latency and outcome only.
 */
export async function generateValidated<T>(
  req: AiRequest<T>,
  model: string,
  call: (user: string, timeoutMs: number) => Promise<string>,
): Promise<T> {
  let user = req.user
  for (let attempt = 1; attempt <= 2; attempt++) {
    const timeoutMs = Math.min(req.timeoutMs, timeLeft() - AI_RESERVE_MS)
    if (timeoutMs < 1_000) {
      log('ai', { task: req.task, model, attempt, outcome: 'no_time' })
      break
    }
    const started = performance.now()
    let outcome = 'ok'
    let status: number | undefined
    let problem = 'The answer was not valid JSON.'
    try {
      const parsed = req.schema.safeParse(JSON.parse(await call(user, timeoutMs)))
      if (parsed.success) {
        log('ai', {
          task: req.task,
          model,
          attempt,
          outcome,
          ms: Math.round(performance.now() - started),
        })
        return parsed.data
      }
      outcome = 'invalid'
      problem = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
        .join('; ')
    } catch (e) {
      outcome = failureOutcome(e)
      status = httpStatusOf(e)
    }
    log('ai', {
      task: req.task,
      model,
      attempt,
      outcome,
      status,
      ms: Math.round(performance.now() - started),
    })
    if (outcome === 'timeout' || status === 429) break // retrying a timeout doubles the wait; a used-up quota stays used up
    user = `${req.user}\n\nYour previous answer was rejected: ${problem.slice(0, 600)}\nReturn JSON that matches the schema and every rule.`
  }
  throw errors.ai()
}
