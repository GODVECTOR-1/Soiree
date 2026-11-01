'use client'

import type { RefObject } from 'react'
import Link from 'next/link'
import { CircleHelp, Copy, KeyRound } from 'lucide-react'
import type { PlanInput } from '@/lib/schemas'
import { countdown, dateParts, daysBetween } from '@/lib/format'

const appUrl = (path: string) =>
  new URL(path, process.env.NEXT_PUBLIC_APP_URL || window.location.origin).toString()

type HeaderProps = {
  slug: string
  /** Edit token, only when the viewer can edit. */
  token: string | null
  canEdit: boolean
  askRef: RefObject<HTMLButtonElement | null>
  onAsk: () => void
  /** Announce a short result in the page's status region. */
  onStatus: (message: string) => void
}

/** Brand, Ask the planner, and the copy-link actions (the edit link only for editors). */
export function PlanHeader({ slug, token, canEdit, askRef, onAsk, onStatus }: HeaderProps) {
  const copy = async (url: string, done: string) => {
    try {
      await navigator.clipboard.writeText(url)
      onStatus(done)
    } catch {
      onStatus('Copy did not work. Share the address bar link instead.')
    }
  }
  const copyShareLink = () =>
    copy(appUrl(`/s/${slug}`), 'View link copied. Anyone with it can see the plan, not change it.')
  const copyEditLink = (editToken: string) =>
    copy(
      appUrl(`/plan/${slug}#edit=${editToken}`),
      'Edit link copied. Share it only with people who should make changes.',
    )

  return (
    <header className="plan-top">
      <Link className="brand" href="/">
        Soirée <span>{canEdit ? 'Your plan' : 'Shared plan'}</span>
      </Link>
      <div className="plan-actions">
        <button ref={askRef} className="quiet-btn" onClick={onAsk} aria-label="Ask the planner">
          <CircleHelp aria-hidden /> <span className="btn-label">Ask the planner</span>
        </button>
        {token && (
          <button
            className="quiet-btn"
            onClick={() => copyEditLink(token)}
            aria-label="Copy edit link"
          >
            <KeyRound aria-hidden /> <span className="btn-label">Copy edit link</span>
          </button>
        )}
        <button className="outline-btn" onClick={copyShareLink} aria-label="Copy share link">
          <Copy aria-hidden /> <span className="btn-label">Copy share link</span>
        </button>
      </div>
    </header>
  )
}

/** The event's date, name, one-line description and the countdown. */
export function PlanTitle({
  input,
  eventName,
  today,
}: {
  input: PlanInput
  eventName: string
  today: string
}) {
  const d = dateParts(input.date)
  const left = countdown(daysBetween(today, input.date))
  const feeling = input.vibes[0]?.toLowerCase() ?? 'thoughtful'
  return (
    <div className="title-row">
      <div>
        <span className="eyebrow">
          {d.weekday}, {d.day} {d.month} {d.year}
        </span>
        <h1>{input.title}</h1>
        <p className="muted">
          A {feeling} {eventName} for {input.guestCount} guests in {input.city}.
        </p>
      </div>
      <div className="countdown">
        <strong>{left.value}</strong>
        <span>{left.label}</span>
      </div>
    </div>
  )
}
