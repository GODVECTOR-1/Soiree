'use client'

import { useReducer } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { samples, type EventType } from '@/lib/schemas'
import { forgetPlan, listLocalPlans } from '@/lib/local-plans'
import { money, shortDate } from '@/lib/format'
import { useHydrated } from '@/lib/use-hydrated'
import { eventLabels } from '@/lib/event-theme'

export default function PlansPage() {
  const hydrated = useHydrated()
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const plans = hydrated ? listLocalPlans() : null

  // Forgets the edit link on this device only; the plan itself stays reachable by its links until it expires.
  const remove = (slug: string, title: string) => {
    if (
      !window.confirm(
        `Remove "${title}" from this device? Anyone with its links can still open it.`,
      )
    )
      return
    forgetPlan(slug)
    refresh()
  }

  return (
    <div className="landing">
      <header className="site-header">
        <Link className="brand" href="/">
          Soirée
        </Link>
        <Link className="primary-btn" href="/create">
          Start planning <ArrowRight aria-hidden />
        </Link>
      </header>
      <main className="plans-page" id="main">
        <span className="eyebrow">Editable from this browser</span>
        <h1>Your plans</h1>
        {plans === null ? (
          <div className="skeleton plans-skeleton" aria-hidden />
        ) : plans.length ? (
          <div className="plans-list">
            {plans.map((p) => (
              <div className="plan-item" key={p.slug}>
                <div>
                  <span className="eyebrow">
                    {eventLabels[p.eventType]} · {shortDate(p.date)}
                  </span>
                  <h2>{p.title}</h2>
                </div>
                <div className="plan-item-actions">
                  <Link className="outline-btn" href={`/plan/${p.slug}`}>
                    Open
                  </Link>
                  <button className="text-btn" onClick={() => remove(p.slug, p.title)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">
            No plans yet.{' '}
            <Link className="text-btn" href="/create">
              Start one in about two minutes
            </Link>
          </p>
        )}

        <h2 className="eyebrow">Or explore a sample</h2>
        <div className="choice-grid sample-grid">
          {(Object.keys(samples) as EventType[]).map((key) => {
            const s = samples[key]
            return (
              <Link className="sample-card" href={`/plan/demo-${key}`} key={key} data-event={key}>
                <span className="eyebrow">{eventLabels[key]}</span>
                <h3>{s.title}</h3>
                <p>
                  {s.guestCount} guests · {money(s.totalBudget, s.currency)}
                </p>
                <span className="text-btn">Open sample</span>
              </Link>
            )
          })}
        </div>
      </main>
    </div>
  )
}
