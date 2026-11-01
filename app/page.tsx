'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Check, ChevronRight, Coins, Heart, Users } from 'lucide-react'
import { Coverflow, type CoverflowSlide } from '@/components/coverflow'
import { MoodField } from '@/components/mood-field'
import { PlanPicker } from '@/components/plan-picker'
import { Ribbon } from '@/components/ribbon'
import { allocate } from '@/lib/domain/allocate'
import { dateParts } from '@/lib/format'
import { eventColors } from '@/lib/event-theme'
import { samples, type EventType } from '@/lib/schemas'

const events: EventType[] = ['wedding', 'birthday', 'community']

const gallery: CoverflowSlide[] = [
  {
    src: '/gallery/wedding-stage.webp',
    alt: 'A bride in a red lehenga and a groom in an ivory sherwani walk down steps under a canopy of hanging flowers and lanterns',
  },
  {
    src: '/gallery/garden-birthday.webp',
    alt: 'Friends sit on cushions around a low picnic spread on a lawn, under string lights at night',
  },
  {
    src: '/gallery/rose-canopy.webp',
    alt: 'Yellow roses hang from strands of fairy lights against a deep blue evening sky',
  },
  {
    src: '/gallery/house-party.webp',
    alt: 'Friends crowd around a table with a candlelit cake at a colorful house party',
  },
  {
    src: '/gallery/courtyard-reception.webp',
    alt: 'Guests mingle at a courtyard reception under strings of glowing bulbs',
  },
  {
    src: '/gallery/pink-birthday.webp',
    alt: 'A pink birthday setup with heart balloons, a rose arch, a neon Happy Birthday sign and a path of petals',
  },
  {
    src: '/gallery/crowd-night.webp',
    alt: 'A cheering crowd at a packed night event, hands raised toward the camera',
  },
  {
    src: '/gallery/pizza-night.webp',
    alt: 'Hands reach over a table of pizza boxes, cups and cake at a late-night party',
  },
]

export default function Page() {
  const [event, setEvent] = useState<EventType>('wedding')
  const sample = samples[event]
  const d = dateParts(sample.date)

  return (
    <div className="landing" data-event={event}>
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

      <main id="main">
        <div className="hero-band">
          <MoodField intenseColor={eventColors[event].mood} />
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">A gentler way to plan</span>
              <h1>
                Plan the celebration,
                <br />
                <em>not the spreadsheet.</em>
              </h1>
              <p>
                One thoughtful plan for the day you&apos;re imagining. Budget, timeline, vendors,
                and ideas, shaped around what matters to you.
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
                {events.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={event === item}
                    onClick={() => setEvent(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

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
          </section>
        </div>

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
