import { z } from 'zod'
import {
  ApiErrorBody,
  AskResponse,
  CreatePlanResponse,
  Idea,
  Plan,
  PlanVersion,
  WhatIfResult,
  type AskRequest,
  type NewVendor,
  type PlanInput,
  type ScenarioInput,
  type VendorPatch,
} from './schemas'

/** A failed API call: stable `code`, plain-language `message`, HTTP `status` (0 when offline). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfterSec?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** The message to show for any thrown value. */
export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'

type Opts = { body?: unknown; token?: string }

/** Send a request; returns the JSON body (null for 204). Failures become an ApiError with a plain message. */
async function send(method: string, path: string, { body, token }: Opts = {}): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers['x-edit-token'] = token
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      'NETWORK',
      'We could not reach Soirée. Check your connection and try again.',
      0,
    )
  }
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const err = ApiErrorBody.safeParse(json)
    if (err.success)
      throw new ApiError(
        err.data.error.code,
        err.data.error.message,
        res.status,
        err.data.error.retryAfterSec,
      )
    throw new ApiError(`HTTP_${res.status}`, 'Something went wrong. Please try again.', res.status)
  }
  return json
}

/** Send a request and parse the response with `schema`; a response of the wrong shape is an ApiError. */
async function request<T>(method: string, path: string, schema: z.ZodType<T>, opts: Opts = {}) {
  const parsed = schema.safeParse(await send(method, path, opts))
  if (!parsed.success)
    throw new ApiError('BAD_RESPONSE', 'Something went wrong. Please reload and try again.', 200)
  return parsed.data
}

/** Send a request whose response has no body worth reading. */
async function command(method: string, path: string, opts: Opts) {
  await send(method, path, opts)
}

const plan = (slug: string) => `/api/plans/${encodeURIComponent(slug)}`
const item = (id: string) => encodeURIComponent(id)

/** Create a plan; the edit token is returned only here. */
export const createPlan = (input: PlanInput) =>
  request('POST', '/api/plans', CreatePlanResponse, { body: input })

/** Current version and history (the browser revalidates with the ETag). */
export const getPlan = (slug: string) => request('GET', plan(slug), Plan)

/** Compute a draft for a scenario; replaces any previous draft. */
export const runWhatIf = (slug: string, token: string, scenario: ScenarioInput) =>
  request('POST', `${plan(slug)}/whatif`, WhatIfResult, { token, body: scenario })

export const discardDraft = (slug: string, token: string) =>
  command('DELETE', `${plan(slug)}/whatif`, { token })

/** Apply a draft; returns the plan as it now stands. */
export const applyVersion = (slug: string, token: string, version: number) =>
  request('POST', `${plan(slug)}/apply`, Plan, { token, body: { version } })

export const updateTask = (slug: string, token: string, taskId: string, done: boolean) =>
  command('PATCH', `${plan(slug)}/tasks/${item(taskId)}`, { token, body: { done } })

export const updateVendor = (slug: string, token: string, vendorId: string, patch: VendorPatch) =>
  command('PATCH', `${plan(slug)}/vendors/${item(vendorId)}`, { token, body: patch })

/** Add the user's own vendor; returns the updated version (the server assigns the id). */
export const addVendor = (slug: string, token: string, vendor: NewVendor) =>
  request('POST', `${plan(slug)}/vendors`, PlanVersion, { token, body: vendor })

/** Remove a vendor the user added. */
export const removeVendor = (slug: string, token: string, vendorId: string) =>
  command('DELETE', `${plan(slug)}/vendors/${item(vendorId)}`, { token })

export const updateIdea = (slug: string, token: string, ideaId: string, saved: boolean) =>
  command('PATCH', `${plan(slug)}/ideas/${item(ideaId)}`, { token, body: { saved } })

/** Fresh ideas; saved ideas are kept. */
export const regenerateIdeas = (slug: string, token: string, feedback?: string) =>
  request('POST', `${plan(slug)}/ideas/regenerate`, z.array(Idea), {
    token,
    body: { feedback: feedback || undefined },
  })

/** Manual allocation; must add up to the budget. Returns the updated version. */
export const saveBudget = (slug: string, token: string, amounts: Record<string, number>) =>
  request('PATCH', `${plan(slug)}/budget`, PlanVersion, { token, body: { amounts } })

export const askPlanner = (slug: string, token: string, req: AskRequest) =>
  request('POST', `${plan(slug)}/ask`, AskResponse, { token, body: req })
