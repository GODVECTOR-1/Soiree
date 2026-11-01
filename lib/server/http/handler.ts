import 'server-only'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import { BODY_LIMIT_BYTES, REQUEST_BUDGET_MS, type IpLimitKey } from '../constants'
import { container, type Container } from '../container'
import { withDeadline } from '../deadline'
import type { PlanRecord } from '../db/planRepository'
import { log } from '../log'
import { ipHash } from '../security/ip'
import { limitIp } from '../security/rateLimit'
import { tokenMatches } from '../security/tokens'
import { AppError, errors } from './errors'

type RouteContext = { params: Promise<Record<string, string>> }

type Options<B> = {
  /** Short endpoint name for logs (never the slug or token). */
  name: string
  /** Per-IP limit group. */
  limit?: IpLimitKey
  /** Require the plan's edit token in `x-edit-token`. */
  auth?: boolean
  /** Request body schema. */
  body?: z.ZodType<B>
}

type HandlerContext<B> = {
  req: Request
  requestId: string
  params: Record<string, string>
  body: B
  /** The authorized plan, loaded once, when `auth` is set. */
  plan: PlanRecord
  c: Container
}

async function readText(req: Request): Promise<string> {
  if (Number(req.headers.get('content-length') ?? 0) > BODY_LIMIT_BYTES) throw errors.tooLarge()
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > BODY_LIMIT_BYTES) {
      await reader.cancel()
      throw errors.tooLarge()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseBody<B>(schema: z.ZodType<B>, text: string): B {
  let json: unknown
  try {
    json = text.trim() ? JSON.parse(text) : {}
  } catch {
    throw new AppError('INVALID_JSON', 400, 'The request body is not valid JSON.')
  }
  const parsed = schema.safeParse(json)
  if (parsed.success) return parsed.data
  const field = parsed.error.issues[0]?.path.join('.')
  throw errors.validation(
    field ? `Check the ${field} field. It is missing or not valid.` : undefined,
  )
}

async function authorize(c: Container, req: Request, slug = ''): Promise<PlanRecord> {
  if (slug.startsWith('demo-')) throw errors.demo()
  const token = req.headers.get('x-edit-token')
  if (!token) throw errors.token()
  const plan = await c.repo.get(slug)
  if (!plan) throw errors.notFound()
  if (!tokenMatches(token, plan.tokenHash)) throw errors.token()
  return plan
}

/** Log an error nobody planned for and replace it with a generic 500 that quotes the request id. */
function unexpected(e: unknown, requestId: string): AppError {
  log('unhandled_error', {
    requestId,
    name: e instanceof Error ? e.name : typeof e,
    detail: e instanceof Error ? e.message.slice(0, 200) : undefined,
  })
  const ref = requestId.slice(0, 8)
  return new AppError('INTERNAL', 500, `Something went wrong. Please try again. (Ref ${ref})`)
}

/** Turn any thrown value into an `ApiErrorBody` response. */
function errorResponse(e: unknown, requestId: string): Response {
  const { code, message, status, retryAfterSec } =
    e instanceof AppError ? e : unexpected(e, requestId)
  const headers: Record<string, string> = { 'x-request-id': requestId, 'cache-control': 'no-store' }
  if (retryAfterSec !== undefined) headers['retry-after'] = String(retryAfterSec)
  const error = { code, message, ...(retryAfterSec !== undefined && { retryAfterSec }) }
  return Response.json({ error }, { status, headers })
}

/** A handler's result as a response: a Response as is, null as 204, anything else as JSON. */
function toResponse(out: Response | object | null): Response {
  if (out instanceof Response) return out
  return out === null ? new Response(null, { status: 204 }) : Response.json(out)
}

/** The request body as text when the route takes one; 415 when it is not JSON. */
async function bodyText(req: Request, takesBody: boolean): Promise<string> {
  if (!takesBody) return ''
  const text = await readText(req)
  if (text.trim() && !req.headers.get('content-type')?.includes('application/json'))
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 415, 'Send the request as JSON.')
  return text
}

/**
 * Route lifecycle: request id, 16 KB body cap (413), content-type check (415), per-IP rate limit (429), token auth
 * (401/403/404), Zod parse (400), service, response. The handler returns a Response, a JSON value, or null (204).
 */
export function withHandler<B = undefined>(
  opts: Options<B>,
  fn: (ctx: HandlerContext<B>) => Promise<Response | object | null>,
) {
  return async (req: Request, route: RouteContext): Promise<Response> => {
    const requestId = randomUUID()
    const started = performance.now()
    let res: Response
    try {
      const c = container()
      const params = await route.params
      const text = await bodyText(req, !!opts.body)
      if (opts.limit) await limitIp(c, opts.limit, ipHash(req.headers, c.salt))
      const plan = opts.auth
        ? await authorize(c, req, params.slug)
        : (undefined as unknown as PlanRecord)
      const body = opts.body ? parseBody(opts.body, text) : (undefined as B)
      const out = await withDeadline(REQUEST_BUDGET_MS, () =>
        fn({ req, requestId, params, body, plan, c }),
      )
      res = toResponse(out)
      res.headers.set('x-request-id', requestId)
      if (!res.headers.has('cache-control')) res.headers.set('cache-control', 'no-store')
    } catch (e) {
      res = errorResponse(e, requestId)
    }
    log('request', {
      requestId,
      endpoint: opts.name,
      status: res.status,
      ms: Math.round(performance.now() - started),
    })
    return res
  }
}
