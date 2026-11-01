'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Check, ChevronRight, Coins, Heart, Users } from 'lucide-react'
import { Coverflow } from '@/components/coverflow'
import { MoodField } from '@/components/mood-field'
import { PlanPicker } from '@/components/plan-picker'
import { Ribbon } from '@/components/ribbon'
import { allocate } from '@/lib/domain/allocate'
import { dateParts } from '@/lib/format'
import { eventColors } from '@/lib/event-theme'
import { EVENT_TYPES, type EventType } from '@/lib/schemas'
import { samples } from '@/lib/samples'
import { gallery } from './gallery'

function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        Soirée
      </Link>
      <nav aria-label="Main">
        <a href="#how">How it works</a>
      </nav>
      <div className="site-actions">
        <PlanPicker />
        <Link className="primary-btn" href="/create">
          Start planning <ArrowRight aria-hidden />
        </Link>
      </div>
    </header>
  )
}

type EventProps = { event: EventType; onEvent: (e: EventType) => void }

/** Headline, calls to action, and the event switch that recolours the page and swaps the sample. */
function HeroCopy({ event, onEvent }: EventProps) {
  return (
    <div className="hero-copy">
      <span className="eyebrow">A gentler way to plan</span>
      <h1>
        Plan the celebration,
        <br />
        <em>not the spreadsheet.</em>
      </h1>
      <p>
        One thoughtful plan for the day you&apos;re imagining. Budget, timeline, vendors, and ideas,
        shaped around what matters to you.
      </p>
      <div className="hero-actions">
        <Link className="primary-btn" href="/create">
          Start planning <ArrowRight aria-hidden />
        </Link>
        <Link className="text-btn" href={`/plan/demo-${event}`}>
          See a sample {event} plan <ChevronRight aria-hidden />
        </Link>
      </div>
      <div className="event-picker" role="group" aria-label="Preview an event type">
        <span>Planning a</span>
        {EVENT_TYPES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={event === item}
            onClick={() => onEvent(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The photo coverflow above a card that opens the sample plan for the chosen event. */
function SampleColumn({ event }: { event: EventType }) {
  const sample = samples[event]
  const d = dateParts(sample.date)
  return (
    <div className="sample-wrap">
      <Coverflow slides={gallery} label="Celebration photos" />
      <Link className="sample-card" href={`/plan/demo-${event}`}>
        <div className="sample-top">
          <span className="eyebrow">Sample plan</span>
          <Heart size={18} aria-hidden />
        </div>
        <h2>{sample.title}</h2>
        <p>
          {d.weekday}, {d.day} {d.month} {d.year} · {sample.city}
        </p>
        <Ribbon lines={allocate(sample)} />
        <div className="sample-bottom">
          <span>
            <Check size={14} aria-hidden /> 100% allocated
          </span>
          <span>{sample.guestCount} guests</span>
        </div>
      </Link>
      <div className="card-note">
        <span className="note-line" />
        Built around your priorities
      </div>
    </div>
  )
}

function HowItWorks() {
  return (
    <section className="trust-row" id="how" aria-label="How it works">
      <div>
        <Coins aria-hidden />
        <strong>Budget with intention</strong>
        <span>See the trade-off behind every line.</span>
      </div>
      <div>
        <CalendarDays aria-hidden />
        <strong>A plan that lives</strong>
        <span>Try a what-if before you change anything.</span>
      </div>
      <div>
        <Users aria-hidden />
        <strong>No account needed</strong>
        <span>Your plan lives at a private link you can share.</span>
      </div>
    </section>
  )
}

export default function Page() {
  const [event, setEvent] = useState<EventType>('wedding')
  return (
    <div className="landing" data-event={event}>
      <SiteHeader />
      <main id="main">
        <div className="hero-band">
          <MoodField intenseColor={eventColors[event].mood} />
          <section className="hero">
            <HeroCopy event={event} onEvent={setEvent} />
            <SampleColumn event={event} />
          </section>
        </div>
        <HowItWorks />
      </main>
      <footer>
        <span>
          Soirée is a planning assistant, not a booking service. All prices are planning estimates.
        </span>
        <span>Made for weddings, birthdays, and neighborhoods.</span>
      </footer>
    </div>
  )
}
