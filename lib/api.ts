import { z } from 'zod'
import {
  ApiErrorBody, AskResponse, CreatePlanResponse, Idea, Plan, PlanVersion, WhatIfResult,
  type AskRequest, type NewVendor, type PlanInput, type ScenarioInput, type VendorPatch,
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
export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

type Opts<T> = { body?: unknown; token?: string; schema?: z.ZodType<T> }

async function request<T>(method: string, path: string, { body, token, schema }: Opts<T> = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers['x-edit-token'] = token
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError('NETWORK', 'We could not reach Soirée. Check your connection and try again.', 0)
  }
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const err = ApiErrorBody.safeParse(json)
    if (err.success) throw new ApiError(err.data.error.code, err.data.error.message, res.status, err.data.error.retryAfterSec)
    throw new ApiError(`HTTP_${res.status}`, 'Something went wrong. Please try again.', res.status)
  }
  if (!schema) return undefined as T
  const parsed = schema.safeParse(json)
  if (!parsed.success) throw new ApiError('BAD_RESPONSE', 'Something went wrong. Please reload and try again.', res.status)
  return parsed.data
}

const plan = (slug: string) => `/api/plans/${encodeURIComponent(slug)}`
const item = (id: string) => encodeURIComponent(id)

/** Create a plan; the edit token is returned only here. */
export const createPlan = (input: PlanInput) => request('POST', '/api/plans', { body: input, schema: CreatePlanResponse })

/** Current version and history (the browser revalidates with the ETag). */
export const getPlan = (slug: string) => request('GET', plan(slug), { schema: Plan })

/** Compute a draft for a scenario; replaces any previous draft. */
export const runWhatIf = (slug: string, token: string, scenario: ScenarioInput) =>
  request('POST', `${plan(slug)}/whatif`, { token, body: scenario, schema: WhatIfResult })

export const discardDraft = (slug: string, token: string) => request<void>('DELETE', `${plan(slug)}/whatif`, { token })

/** Apply a draft; returns the plan as it now stands. */
export const applyVersion = (slug: string, token: string, version: number) =>
  request('POST', `${plan(slug)}/apply`, { token, body: { version }, schema: Plan })

export const updateTask = (slug: string, token: string, taskId: string, done: boolean) =>
  request<void>('PATCH', `${plan(slug)}/tasks/${item(taskId)}`, { token, body: { done } })

export const updateVendor = (slug: string, token: string, vendorId: string, patch: VendorPatch) =>
  request<void>('PATCH', `${plan(slug)}/vendors/${item(vendorId)}`, { token, body: patch })

/** Add the user's own vendor; returns the updated version (the server assigns the id). */
export const addVendor = (slug: string, token: string, vendor: NewVendor) =>
  request('POST', `${plan(slug)}/vendors`, { token, body: vendor, schema: PlanVersion })

/** Remove a vendor the user added. */
export const removeVendor = (slug: string, token: string, vendorId: string) =>
  request<void>('DELETE', `${plan(slug)}/vendors/${item(vendorId)}`, { token })

export const updateIdea = (slug: string, token: string, ideaId: string, saved: boolean) =>
  request<void>('PATCH', `${plan(slug)}/ideas/${item(ideaId)}`, { token, body: { saved } })

/** Fresh ideas; saved ideas are kept. */
export const regenerateIdeas = (slug: string, token: string, feedback?: string) =>
  request('POST', `${plan(slug)}/ideas/regenerate`, { token, body: { feedback: feedback || undefined }, schema: z.array(Idea) })

/** Manual allocation; must add up to the budget. Returns the updated version. */
export const saveBudget = (slug: string, token: string, amounts: Record<string, number>) =>
  request('PATCH', `${plan(slug)}/budget`, { token, body: { amounts }, schema: PlanVersion })

export const askPlanner = (slug: string, token: string, req: AskRequest) =>
  request('POST', `${plan(slug)}/ask`, { token, body: req, schema: AskResponse })
