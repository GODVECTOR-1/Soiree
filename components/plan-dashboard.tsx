'use client'

import { useRef, useState } from 'react'
import { TimelineView } from '@/components/timeline-view'
import { VendorsView } from '@/components/vendors-view'
import { BudgetView } from '@/components/budget-view'
import { IdeasView } from '@/components/ideas-view'
import type { ViewProps } from '@/components/plan-views'
import { Overview } from '@/components/overview-view'
import { WhatIfView } from '@/components/what-if-view'
import { PlannerDrawer } from '@/components/planner-drawer'
import { FrameBorder } from '@/components/frame-border'
import { PlanHeader, PlanTitle } from '@/components/plan-header'
import { PlanNav, viewFromUrl, writeViewToUrl, type View } from '@/components/plan-nav'
import { useTimedStatus } from '@/hooks/useTimedStatus'
import type { PlanInput, PlanVersion, WhatIfResult } from '@/lib/schemas'
import type { PlanAction } from '@/lib/domain/actions'
import { errorMessage } from '@/lib/api'
import { todayIso } from '@/lib/format'
import { eventColors, eventLabels } from '@/lib/event-theme'

type Props = {
  slug: string
  input: PlanInput
  version: PlanVersion
  canEdit: boolean
  /** Edit token, only when the viewer can edit. */
  token: string | null
  /** The seam to the server. Rejects with an ApiError after rolling back. */
  onAction: (action: PlanAction) => Promise<void>
}

type SwitchProps = ViewProps & {
  view: View
  today: string
  draft: WhatIfResult | null
  onDraft: (d: WhatIfResult | null) => void
  onApply: (d: WhatIfResult) => void
  onSelect: (v: View) => void
}

/** The open section of the plan. */
function ViewSwitch({ view, today, draft, onDraft, onApply, onSelect, ...props }: SwitchProps) {
  switch (view) {
    case 'budget':
      return <BudgetView {...props} />
    case 'timeline':
      return <TimelineView {...props} />
    case 'vendors':
      return <VendorsView {...props} />
    case 'ideas':
      return <IdeasView {...props} />
    case 'what-if':
      return <WhatIfView {...props} draft={draft} onDraft={onDraft} onApply={onApply} />
    default:
      return <Overview {...props} today={today} onSelect={onSelect} draft={draft} />
  }
}

/**
 * Runs plan actions and announces the outcome in the status region; holds the unapplied what-if draft, which is
 * cleared once applied.
 */
function usePlanActions(dispatch: Props['onAction']) {
  const [draft, setDraft] = useState<WhatIfResult | null>(null)
  const [status, setStatus] = useTimedStatus()

  const run = async (action: PlanAction, message?: string) => {
    try {
      await dispatch(action)
      if (message) setStatus(message)
      return true
    } catch (e) {
      setStatus(errorMessage(e))
      return false
    }
  }

  const apply = async (d: WhatIfResult) => {
    const message = `Applied. ${d.draft.scenario} is now part of your plan.`
    if (await run({ type: 'apply', result: d }, message)) setDraft(null)
  }

  return { draft, setDraft, status, setStatus, run, apply }
}

/** A plan: header actions, section nav, the open section, the Ask drawer and a status region for results. */
export function PlanDashboard({ slug, input, version, canEdit, token, onAction: dispatch }: Props) {
  // The dashboard only mounts in the browser (the page resolves the plan first), so reading the URL here is safe.
  const [view, setView] = useState<View>(viewFromUrl)
  const [drawer, setDrawer] = useState(false)
  const { draft, setDraft, status, setStatus, run, apply } = usePlanActions(dispatch)
  const mainRef = useRef<HTMLElement>(null)
  const askRef = useRef<HTMLButtonElement>(null)
  const eventName = eventLabels[input.eventType].toLowerCase()
  const colors = eventColors[input.eventType]

  const select = (v: View) => {
    setView(v)
    writeViewToUrl(v)
    mainRef.current?.focus()
  }

  const viewProps: ViewProps = {
    slug,
    token,
    input,
    version,
    canEdit,
    onAction: (a, m) => run(a, m).then(() => {}),
  }

  return (
    <div data-event={input.eventType}>
      {/* Sample plans get a glowing frame: the event's accent blending into its lighter partner. */}
      {slug.startsWith('demo-') && <FrameBorder colors={[colors.accent, colors.light]} />}
      <PlanHeader
        slug={slug}
        token={token}
        canEdit={canEdit}
        askRef={askRef}
        onAsk={() => setDrawer(true)}
        onStatus={setStatus}
      />
      <div className="plan-layout">
        <PlanNav view={view} onSelect={select} eventName={eventName} />
        <main className="plan-main" id="main" ref={mainRef} tabIndex={-1}>
          <PlanTitle input={input} eventName={eventName} today={todayIso()} />
          {!canEdit && (
            <p className="draft-banner">You are viewing a shared plan. Changes are off.</p>
          )}
          <ViewSwitch
            {...viewProps}
            view={view}
            today={todayIso()}
            draft={draft}
            onDraft={setDraft}
            onApply={apply}
            onSelect={select}
          />
        </main>
      </div>
      {drawer && (
        <PlannerDrawer
          slug={slug}
          token={token}
          onClose={() => {
            setDrawer(false)
            askRef.current?.focus()
          }}
          onSelect={(v) => {
            setDrawer(false)
            select(v)
          }}
        />
      )}
      <div className="notice" role="status" aria-live="polite">
        {status}
      </div>
    </div>
  )
}
