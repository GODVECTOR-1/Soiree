'use client'

import { useReducer } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { samples, type EventType } from '@/lib/schemas'
import { forgetPlan, listLocalPlans } from '@/lib/local-plans'
import { money, shortDate } from '@/lib/format'
import { useHydrated } from '@/lib/use-hydrated'

export default function PlansPage() {
  const hydrated = useHydrated()
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const plans = hydrated ? listLocalPlans() : null

  // Forgets the edit link on this device only; the plan itself stays reachable by its links until it expires.
  const remove = (slug: string, title: string) => {
    if (!window.confirm(`Remove "${title}" from this device? Anyone with its links can still open it.`)) return
    forgetPlan(slug)
    refresh()
  }

  return (
    <main className="landing" id="main">
      <header className="site-header">
        <Link className="brand" href="/">Soirée</Link>
        <Link className="primary-btn" href="/create">
          Start planning <ArrowRight aria-hidden />
        </Link>
      </header>
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '64px 0' }}>
        <span className="eyebrow">Editable from this browser</span>
        <h1 className="serif" style={{ fontSize: 44, margin: '12px 0 0', letterSpacing: '-0.03em' }}>Your plans</h1>
        {plans === null ? (
          <div className="skeleton" style={{ height: 88, margin: '24px 0 56px' }} aria-hidden />
        ) : plans.length ? (
          <div className="plans-list">
            {plans.map((p) => (
              <div className="plan-item" key={p.slug}>
                <div>
                  <span className="eyebrow">{p.eventType} · {shortDate(p.date)}</span>
                  <h3>{p.title}</h3>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Link className="outline-btn" href={`/plan/${p.slug}`}>Open</Link>
                  <button className="text-btn" onClick={() => remove(p.slug, p.title)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">
            No plans yet. <Link className="text-btn" href="/create">Start one in about two minutes</Link>
          </p>
        )}

        <span className="eyebrow">Or explore a sample</span>
        <div className="choice-grid" style={{ marginTop: 16 }}>
          {(Object.keys(samples) as EventType[]).map((key) => {
            const s = samples[key]
            return (
              <Link className="sample-card" href={`/plan/demo-${key}`} key={key} data-event={key}>
                <span className="eyebrow">{key}</span>
                <h2 style={{ marginTop: 16 }}>{s.title}</h2>
                <p>{s.guestCount} guests · {money(s.totalBudget, s.currency)}</p>
                <span className="text-btn">Open sample</span>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
