'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlanDashboard } from '@/components/plan-dashboard'
import type { Plan } from '@/lib/schemas'
import { applyAction, type PlanAction } from '@/lib/domain/actions'
import { allTasks } from '@/lib/domain/timeline'
import { addVendor, ApiError, applyVersion, errorMessage, getPlan, removeVendor, saveBudget, updateIdea, updateTask, updateVendor } from '@/lib/api'
import { rememberPlan } from '@/lib/local-plans'
import { usePlanAccess } from '@/hooks/usePlanAccess'
import { LoadingScreen } from '@/components/loading-screen'

type State =
  | { slug: string; status: 'loading' }
  | { slug: string; status: 'missing' }
  | { slug: string; status: 'error'; message: string }
  | { slug: string; status: 'ready'; plan: Plan }

/** Server write for an action. Optimistic actions were already applied locally; `ideas` was stored by regenerate. */
async function persist(slug: string, token: string, plan: Plan, action: PlanAction): Promise<Plan | void> {
  const v = plan.current
  switch (action.type) {
    case 'task':
      return updateTask(slug, token, action.id, !allTasks(v.phases).find((t) => t.id === action.id)?.done)
    case 'vendor':
      return updateVendor(slug, token, action.id, action.patch)
    case 'vendor-add':
      return { ...plan, current: await addVendor(slug, token, { category: action.category, name: action.name }) }
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

/**
 * Loads a plan from the API and owns the one seam between the dashboard and the server. `view` mode (the /s/ link)
 * never reads a token.
 */
export function PlanLoader({ slug, mode }: { slug: string; mode: 'edit' | 'view' }) {
  const { token } = usePlanAccess(slug, mode === 'edit')
  const [state, setState] = useState<State>({ slug, status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const current: State = state.slug === slug ? state : { slug, status: 'loading' }

  useEffect(() => {
    let live = true
    getPlan(slug)
      .then((plan) => live && setState({ slug, status: 'ready', plan }))
      .catch((e: unknown) => {
        if (!live) return
        setState(e instanceof ApiError && e.status === 404 ? { slug, status: 'missing' } : { slug, status: 'error', message: errorMessage(e) })
      })
    return () => {
      live = false
    }
  }, [slug, attempt])

  const plan = current.status === 'ready' ? current.plan : null
  const canEdit = !!token && !!plan && !plan.readOnly

  useEffect(() => {
    if (plan && canEdit) rememberPlan({ slug, title: plan.input.title, eventType: plan.input.eventType, date: plan.input.date })
  }, [plan, canEdit, slug])

  if (current.status === 'loading')
    return (
      <main id="main">
        <LoadingScreen title="Opening your plan" steps={['Fetching the latest version', 'Checking the budget adds up', 'Lining up what is due next']} />
      </main>
    )

  if (current.status !== 'ready')
    return (
      <main className="landing" id="main" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <span className="eyebrow">{current.status === 'missing' ? 'Plan not found' : 'Something went wrong'}</span>
          <h1 className="serif" style={{ fontSize: 44, margin: '14px 0' }}>
            {current.status === 'missing' ? 'We couldn’t find that plan' : 'We couldn’t load this plan'}
          </h1>
          <p className="muted" role="alert">
            {current.status === 'missing' ? 'It may have expired, or the link may be incomplete.' : current.message}
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            {current.status === 'error' && (
              <button className="primary-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
            )}
            <Link className={current.status === 'error' ? 'outline-btn' : 'primary-btn'} href="/create">Start a plan</Link>
            <Link className="outline-btn" href="/plans">Your plans</Link>
          </div>
        </div>
      </main>
    )

  const ready = current.plan
  const set = (p: Plan) => setState({ slug, status: 'ready', plan: p })

  const onAction = async (action: PlanAction) => {
    if (!token || !canEdit) return
    if (action.type === 'apply' || action.type === 'vendor-add') {
      // Not optimistic: the server merges progress (apply) or assigns the new vendor's id.
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

  return <PlanDashboard slug={slug} input={ready.input} version={ready.current} canEdit={canEdit} token={canEdit ? token : null} onAction={onAction} />
}
