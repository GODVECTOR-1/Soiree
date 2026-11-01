'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlanDashboard } from '@/components/plan-dashboard'
import type { Plan } from '@/lib/schemas'
import { applyAction, type PlanAction } from '@/lib/domain/actions'
import { allTasks } from '@/lib/domain/timeline'
import {
  addVendor,
  ApiError,
  applyVersion,
  errorMessage,
  getPlan,
  removeVendor,
  saveBudget,
  updateIdea,
  updateTask,
  updateVendor,
} from '@/lib/api'
import { rememberPlan } from '@/lib/local-plans'
import { usePlanAccess } from '@/hooks/usePlanAccess'
import { LoadingScreen } from '@/components/loading-screen'

type State =
  | { slug: string; status: 'loading' }
  | { slug: string; status: 'missing' }
  | { slug: string; status: 'error'; message: string }
  | { slug: string; status: 'ready'; plan: Plan }

/** Server write for an action. Optimistic actions were already applied locally; `ideas` was stored by regenerate. */
async function persist(
  slug: string,
  token: string,
  plan: Plan,
  action: PlanAction,
): Promise<Plan | void> {
  const v = plan.current
  switch (action.type) {
    case 'task':
      return updateTask(
        slug,
        token,
        action.id,
        !allTasks(v.phases).find((t) => t.id === action.id)?.done,
      )
    case 'vendor':
      return updateVendor(slug, token, action.id, action.patch)
    case 'vendor-add':
      return {
        ...plan,
        current: await addVendor(slug, token, { category: action.category, name: action.name }),
      }
    case 'vendor-remove':
      return removeVendor(slug, token, action.id)
    case 'idea':
      return updateIdea(slug, token, action.id, !v.ideas.find((i) => i.id === action.id)?.saved)
    case 'budget':
      return { ...plan, current: await saveBudget(slug, token, action.amounts) }
    case 'apply':
      return applyVersion(slug, token, action.result.draft.version)
    case 'ideas':
      return
  }
}

/** Fetches the plan for `slug`; `retry` fetches again. A slug change starts over at "loading". */
function usePlan(slug: string) {
  const [state, setState] = useState<State>({ slug, status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const current: State = state.slug === slug ? state : { slug, status: 'loading' }

  useEffect(() => {
    let live = true
    getPlan(slug)
      .then((plan) => live && setState({ slug, status: 'ready', plan }))
      .catch((e: unknown) => {
        if (!live) return
        const missing = e instanceof ApiError && e.status === 404
        setState(
          missing
            ? { slug, status: 'missing' }
            : { slug, status: 'error', message: errorMessage(e) },
        )
      })
    return () => {
      live = false
    }
  }, [slug, attempt])

  const set = (plan: Plan) => setState({ slug, status: 'ready', plan })
  const retry = () => setAttempt((n) => n + 1)
  return { current, set, retry }
}

/**
 * Runs an action against the server. Most actions apply locally first and roll back if the server refuses; `apply`
 * and `vendor-add` wait for the server (it merges progress, or assigns the new vendor's id).
 */
function actionRunner(slug: string, token: string, ready: Plan, set: (p: Plan) => void) {
  return async (action: PlanAction) => {
    if (action.type === 'apply' || action.type === 'vendor-add') {
      const next = await persist(slug, token, ready, action)
      if (next) set(next)
      return
    }
    const local = applyAction(ready.input, ready.current, action)
    set({ ...ready, input: local.input, current: local.version })
    try {
      const next = await persist(slug, token, ready, action)
      if (next) set(next)
    } catch (e) {
      // Roll back to what the server holds (or the snapshot if it cannot be reached), then let the dashboard announce it.
      await getPlan(slug).then(set, () => set(ready))
      throw e
    }
  }
}

const problemCopy = {
  missing: {
    eyebrow: 'Plan not found',
    title: 'We couldn’t find that plan',
    detail: 'It may have expired, or the link may be incomplete.',
  },
  error: { eyebrow: 'Something went wrong', title: 'We couldn’t load this plan', detail: '' },
}

/** A plan that is missing or failed to load: what happened, and where to go next. */
function PlanProblem({ state, onRetry }: { state: State; onRetry: () => void }) {
  const failed = state.status === 'error'
  const copy = problemCopy[failed ? 'error' : 'missing']
  return (
    <main className="landing center-page" id="main">
      <div>
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p className="muted" role="alert">
          {state.status === 'error' ? state.message : copy.detail}
        </p>
        <div className="hero-actions">
          {failed && (
            <button className="primary-btn" onClick={onRetry}>
              Try again
            </button>
          )}
          <Link className={failed ? 'outline-btn' : 'primary-btn'} href="/create">
            Start a plan
          </Link>
          <Link className="outline-btn" href="/plans">
            Your plans
          </Link>
        </div>
      </div>
    </main>
  )
}

/**
 * Loads a plan from the API and owns the one seam between the dashboard and the server. `view` mode (the /s/ link)
 * never reads a token.
 */
export function PlanLoader({ slug, mode }: { slug: string; mode: 'edit' | 'view' }) {
  const token = usePlanAccess(slug, mode === 'edit')
  const { current, set, retry } = usePlan(slug)
  const plan = current.status === 'ready' ? current.plan : null
  const editToken = plan && !plan.readOnly ? token : null

  useEffect(() => {
    if (!plan || !editToken) return
    const { title, eventType, date } = plan.input
    rememberPlan({ slug, title, eventType, date })
  }, [plan, editToken, slug])

  if (current.status === 'loading')
    return (
      <main id="main">
        <LoadingScreen
          title="Opening your plan"
          steps={[
            'Fetching the latest version',
            'Checking the budget adds up',
            'Lining up what is due next',
          ]}
        />
      </main>
    )
  if (current.status !== 'ready') return <PlanProblem state={current} onRetry={retry} />

  const ready = current.plan
  const run = editToken ? actionRunner(slug, editToken, ready, set) : async () => {}
  return (
    <PlanDashboard
      slug={slug}
      input={ready.input}
      version={ready.current}
      canEdit={!!editToken}
      token={editToken}
      onAction={run}
    />
  )
}
