'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronRight, CircleHelp, Copy, Heart, KeyRound, Lightbulb } from 'lucide-react'
import { Ribbon } from '@/components/ribbon'
import { TimelineView } from '@/components/timeline-view'
import { VendorsView } from '@/components/vendors-view'
import {
  BudgetView, IdeasView, PlanningCalendar, ProgressRing, TaskRow, type ViewProps,
} from '@/components/plan-views'
import { WhatIfView } from '@/components/what-if-view'
import { PlannerDrawer } from '@/components/planner-drawer'
import { FrameBorder } from '@/components/frame-border'
import type { PlanInput, PlanVersion, WhatIfResult } from '@/lib/schemas'
import { totalCheck } from '@/lib/domain/allocate'
import { allTasks, taskPriority } from '@/lib/domain/timeline'
import { quoteCheck } from '@/lib/domain/vendors'
import type { PlanAction } from '@/lib/domain/actions'
import { errorMessage } from '@/lib/api'
import { dateParts, daysBetween, money, todayIso } from '@/lib/format'

// Sample plans get a glowing frame: each event's accent blending into a lighter partner.
const frameColors: Record<PlanInput['eventType'], [string, string]> = {
  wedding: ['#b5446e', '#ff8fc7'],
  birthday: ['#c4421f', '#ffa54d'],
  community: ['#0b7f6b', '#5fd4b8'],
}

const VIEWS = ['overview', 'budget', 'timeline', 'vendors', 'ideas', 'what-if'] as const
export type View = (typeof VIEWS)[number]
const viewLabels: Record<View, string> = {
  overview: 'Overview', budget: 'Budget', timeline: 'Timeline', vendors: 'Vendors', ideas: 'Ideas', 'what-if': 'What-if',
}
const isView = (v: string | null): v is View => VIEWS.includes(v as View)

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

const appUrl = (path: string) => new URL(path, process.env.NEXT_PUBLIC_APP_URL || window.location.origin).toString()

export function PlanDashboard({ slug, input, version, canEdit, token, onAction: dispatch }: Props) {
  // The dashboard only mounts in the browser (the page resolves the plan first), so reading the URL here is safe.
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    return isView(v) ? v : 'overview'
  })
  const [drawer, setDrawer] = useState(false)
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState<WhatIfResult | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const askRef = useRef<HTMLButtonElement>(null)
  const today = todayIso()

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), 3500)
    return () => clearTimeout(t)
  }, [status])

  const select = (v: View) => {
    setView(v)
    const url = new URL(window.location.href)
    if (v === 'overview') url.searchParams.delete('view')
    else url.searchParams.set('view', v)
    window.history.replaceState(null, '', url)
    mainRef.current?.focus()
  }

  const onAction = async (action: PlanAction, message?: string) => {
    try {
      await dispatch(action)
      if (message) setStatus(message)
    } catch (e) {
      setStatus(errorMessage(e))
    }
  }

  const apply = async (d: WhatIfResult) => {
    try {
      await dispatch({ type: 'apply', result: d })
      setDraft(null)
      setStatus(`Applied. ${d.draft.scenario} is now part of your plan.`)
    } catch (e) {
      setStatus(errorMessage(e))
    }
  }

  const copy = async (url: string, done: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setStatus(done)
    } catch {
      setStatus('Copy did not work. Share the address bar link instead.')
    }
  }
  const copyLink = () => copy(appUrl(`/s/${slug}`), 'View link copied. Anyone with it can see the plan, not change it.')
  const copyEditLink = () => token && copy(appUrl(`/plan/${slug}#edit=${token}`), 'Edit link copied. Share it only with people who should make changes.')

  const closeDrawer = () => {
    setDrawer(false)
    askRef.current?.focus()
  }

  const viewProps: ViewProps = { slug, token, input, version, canEdit, onAction }
  const d = dateParts(input.date)
  const days = daysBetween(today, input.date)
  const eventName = input.eventType === 'community' ? 'community gathering' : input.eventType

  return (
    <div className="plan-shell" data-event={input.eventType}>
      {slug.startsWith('demo-') && <FrameBorder colors={frameColors[input.eventType]} />}
      <header className="plan-top">
        <Link className="brand brand-home" href="/">
          Soirée <span>{canEdit ? 'Your plan' : 'Shared plan'}</span>
        </Link>
        <div className="plan-actions">
          <button ref={askRef} className="quiet-btn" onClick={() => setDrawer(true)} aria-label="Ask the planner">
            <CircleHelp aria-hidden /> <span className="btn-label">Ask the planner</span>
          </button>
          {token && (
            <button className="quiet-btn" onClick={copyEditLink} aria-label="Copy edit link">
              <KeyRound aria-hidden /> <span className="btn-label">Copy edit link</span>
            </button>
          )}
          <button className="outline-btn" onClick={copyLink} aria-label="Copy share link">
            <Copy aria-hidden /> <span className="btn-label">Copy share link</span>
          </button>
        </div>
      </header>

      <div className="plan-layout">
        <nav className="sidebar" aria-label="Plan sections">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => select(v)} aria-current={view === v ? 'page' : undefined}>
              {view === v && <span className="nav-dot" aria-hidden />} {viewLabels[v]}
            </button>
          ))}
          <div className="sidebar-bottom">
            <span className="event-chip">
              <Heart size={14} aria-hidden /> {eventName}
            </span>
            <Link className="quiet-btn" href="/plans">
              Plans on this device
            </Link>
          </div>
        </nav>

        <main className="plan-main" id="main" ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
          <div className="title-row">
            <div>
              <span className="eyebrow">
                {d.weekday}, {d.day} {d.month} {d.year}
              </span>
              <h1>{input.title}</h1>
              <p className="muted">
                A {input.vibes[0]?.toLowerCase() ?? 'thoughtful'} {eventName} for {input.guestCount} guests in {input.city}.
              </p>
            </div>
            <div className="countdown">
              <strong>{days > 0 ? days : days === 0 ? 'Today' : 'Done'}</strong>
              <span>{days > 0 ? 'days to go' : days === 0 ? 'is the day' : 'this one has passed'}</span>
            </div>
          </div>
          {!canEdit && <p className="draft-banner">You are viewing a shared plan. Changes are off.</p>}

          {view === 'overview' && (
            <Overview {...viewProps} today={today} onSelect={select} draft={draft} />
          )}
          {view === 'budget' && <BudgetView {...viewProps} />}
          {view === 'timeline' && <TimelineView {...viewProps} />}
          {view === 'vendors' && <VendorsView {...viewProps} />}
          {view === 'ideas' && <IdeasView {...viewProps} />}
          {view === 'what-if' && <WhatIfView {...viewProps} draft={draft} onDraft={setDraft} onApply={apply} />}
        </main>
      </div>

      {drawer && <PlannerDrawer slug={slug} token={token} onClose={closeDrawer} onSelect={(v) => { setDrawer(false); select(v) }} />}
      <div className="notice" role="status" aria-live="polite">
        {status}
      </div>
    </div>
  )
}

function Overview({ input, version, canEdit, onAction, today, onSelect, draft }: ViewProps & { today: string; onSelect: (v: View) => void; draft: WhatIfResult | null }) {
  const check = totalCheck(version.lines, version.budgetTotal)
  // High-priority work first (due now, tied to a ranked priority, a guest need), then the calendar order.
  const rank = { high: 0, medium: 1, low: 2 } as const
  const nextTasks = allTasks(version.phases)
    .filter((t) => !t.done)
    .map((t, i) => ({ t, i, r: rank[taskPriority(t, input).level] }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, 4)
    .map((x) => x.t)
  const overQuotes = version.vendors.filter((v) => quoteCheck(v) === 'over')
  const booked = version.vendors.filter((v) => v.status === 'booked').length
  const moving = version.vendors.filter((v) => v.status === 'shortlisting' || v.status === 'quote_received').length
  const priorityRank = (c: string) => {
    const r = input.priorities.indexOf(c)
    return r < 0 ? 9 : r
  }
  const nextVendors = version.vendors.filter((v) => v.status !== 'booked').sort((a, b) => priorityRank(a.category) - priorityRank(b.category)).slice(0, 2)
  const ideas = [...version.ideas].sort((a, b) => Number(b.saved) - Number(a.saved)).slice(0, 3)

  return (
    <>
      {version.narrative && <p className="narrative">{version.narrative}</p>}
      <PlanningCalendar input={input} today={today} />

      <section className="budget-section" aria-labelledby="budget-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">The shape of your spend</span>
            <h2 id="budget-title">Budget allocation</h2>
          </div>
          <button className="text-btn" onClick={() => onSelect('budget')}>
            See full budget <ChevronRight aria-hidden />
          </button>
        </div>
        <Ribbon lines={version.lines} />
        <div className="budget-total">
          <span>
            <b>{money(version.budgetTotal, input.currency)}</b> total budget
          </span>
          <span>
            {check.ok ? <Check size={16} aria-hidden /> : '!'} {check.ok ? '100% allocated' : 'Not fully allocated'}
          </span>
        </div>
      </section>

      <section className="overview-grid">
        <div className="plain-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">The next small steps</span>
              <h2>Keep things moving</h2>
            </div>
            <button className="text-btn" onClick={() => onSelect('timeline')}>
              Timeline <ChevronRight aria-hidden />
            </button>
          </div>
          <div className="task-list">
            {nextTasks.length ? (
              nextTasks.map((t) => <TaskRow key={t.id} task={t} input={input} canEdit={canEdit} onToggle={() => onAction({ type: 'task', id: t.id })} />)
            ) : (
              <p className="muted">Everything is done. Enjoy the day.</p>
            )}
          </div>
        </div>
        <div className="callout">
          <span className="eyebrow">{draft ? 'Draft waiting' : 'Try a what-if'}</span>
          <h3>{draft ? draft.draft.scenario : 'What if the guest count changes?'}</h3>
          <p>
            {draft
              ? 'You have a scenario that is not applied yet. Review it, then apply or discard.'
              : 'See what happens to your budget before you make the call. Your priorities stay protected.'}
          </p>
          <button className="outline-btn" onClick={() => onSelect('what-if')}>
            {draft ? 'Review the draft' : 'Open scenario lab'} <ArrowRight aria-hidden />
          </button>
        </div>
      </section>

      <section className="lower-grid">
        <div>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Vendor progress</span>
              <h2>{booked ? 'Good foundations' : 'Where to start'}</h2>
            </div>
            <button className="text-btn" onClick={() => onSelect('vendors')}>
              Vendors <ChevronRight aria-hidden />
            </button>
          </div>
          <div className="vendor-line">
            <ProgressRing value={booked} total={version.vendors.length} label={`${booked} of ${version.vendors.length} vendors booked`} />
            <div>
              <strong>
                {booked} booked{moving ? `, ${moving} in progress` : ''}
              </strong>
              <p className="muted">
                {nextVendors.length ? `Next to compare: ${nextVendors.map((v) => v.category).join(', ')}.` : 'Every vendor is booked.'}
              </p>
              {overQuotes.length > 0 && (
                <p className="quote-note" data-check="over">
                  {overQuotes.length === 1 ? '1 quote is' : `${overQuotes.length} quotes are`} over the planning range:{' '}
                  {overQuotes.map((v) => v.name || v.category).join(', ')}.
                </p>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Made for you</span>
              <h2>Ideas to keep</h2>
            </div>
            <button className="text-btn" onClick={() => onSelect('ideas')}>
              All ideas <ChevronRight aria-hidden />
            </button>
          </div>
          {ideas.map((i) => (
            <div className="idea-row" key={i.id}>
              <Lightbulb size={17} aria-hidden />
              <div>
                <span>{i.kind}</span>
                <strong>{i.title}</strong>
              </div>
              {canEdit && (
                <button className="save-btn" aria-pressed={i.saved} aria-label={`${i.saved ? 'Unsave' : 'Save'} ${i.title}`} onClick={() => onAction({ type: 'idea', id: i.id })}>
                  <Heart size={18} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
