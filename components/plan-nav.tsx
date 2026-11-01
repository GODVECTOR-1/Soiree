'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'

const VIEWS = ['overview', 'budget', 'timeline', 'vendors', 'ideas', 'what-if'] as const
export type View = (typeof VIEWS)[number]

const viewLabels: Record<View, string> = {
  overview: 'Overview',
  budget: 'Budget',
  timeline: 'Timeline',
  vendors: 'Vendors',
  ideas: 'Ideas',
  'what-if': 'What-if',
}

/** The view named in the address bar (`?view=`), or the overview. Browser only. */
export function viewFromUrl(): View {
  const v = new URLSearchParams(window.location.search).get('view')
  return VIEWS.find((x) => x === v) ?? 'overview'
}

/** Record the view in the address bar without adding history, so a reload or shared link opens it. */
export function writeViewToUrl(v: View) {
  const url = new URL(window.location.href)
  if (v === 'overview') url.searchParams.delete('view')
  else url.searchParams.set('view', v)
  window.history.replaceState(null, '', url)
}

type Props = { view: View; onSelect: (v: View) => void; eventName: string }

/** Section tabs down the side (a scrolling row on phones), with the event type and a link to this device's plans. */
export function PlanNav({ view, onSelect, eventName }: Props) {
  return (
    <nav className="sidebar" aria-label="Plan sections">
      {VIEWS.map((v) => (
        <button key={v} onClick={() => onSelect(v)} aria-current={view === v ? 'page' : undefined}>
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
  )
}
