'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, FolderHeart, X } from 'lucide-react'
import { LoadingScreen } from '@/components/loading-screen'
import { listLocalPlans, type LocalPlan } from '@/lib/local-plans'
import { EVENT_TYPES } from '@/lib/schemas'
import { samples } from '@/lib/samples'
import { shortDate } from '@/lib/format'
import { eventLabels } from '@/lib/event-theme'

type RowProps = Omit<LocalPlan, 'date'> & {
  date?: string
  note?: string
  onChoose: (slug: string, title: string) => void
}

function PlanRow({ slug, title, eventType, date, note, onChoose }: RowProps) {
  return (
    <li>
      <button
        type="button"
        className="picker-item"
        data-event={eventType}
        onClick={() => onChoose(slug, title)}
      >
        <span>
          <span className="eyebrow">
            {[eventLabels[eventType], date && shortDate(date), note].filter(Boolean).join(' · ')}
          </span>
          <strong>{title}</strong>
        </span>
        <ChevronRight aria-hidden />
      </button>
    </li>
  )
}

type Choose = (slug: string, title: string) => void

/** Plans made in this browser, newest first, or a nudge to start one. */
function YourPlans({ plans, onChoose }: { plans: LocalPlan[]; onChoose: Choose }) {
  return (
    <section aria-labelledby="picker-mine">
      <h3 id="picker-mine" className="eyebrow">
        Made in this browser
      </h3>
      {plans.length > 0 && (
        <ul className="picker-list">
          {plans.map((p) => (
            <PlanRow key={p.slug} {...p} onChoose={onChoose} />
          ))}
        </ul>
      )}
      {!plans.length && (
        <p className="picker-empty">
          No plans yet. <Link href="/create">Start one in about two minutes</Link>
        </p>
      )}
    </section>
  )
}

/** The three read-only samples. Their dates move forward on the server, so no date is shown. */
function SamplePlans({ onChoose }: { onChoose: Choose }) {
  return (
    <section aria-labelledby="picker-samples">
      <h3 id="picker-samples" className="eyebrow">
        Sample plans
      </h3>
      <ul className="picker-list">
        {EVENT_TYPES.map((k) => (
          <PlanRow
            key={k}
            slug={`demo-${k}`}
            title={samples[k].title}
            eventType={k}
            note="Sample"
            onChoose={onChoose}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * "Your plans" button and dialog: the plans made in this browser and the three samples. Choosing one shows the
 * loading screen straight away and opens the plan (the plan page keeps the same screen until it has loaded).
 */
export function PlanPicker() {
  const dialog = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [plans, setPlans] = useState<LocalPlan[]>([])
  const [opening, setOpening] = useState<string | null>(null)

  const open = () => {
    setPlans(listLocalPlans())
    dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()
  const choose = (slug: string, title: string) => {
    close()
    setOpening(title)
    router.push(`/plan/${slug}`)
  }

  return (
    <>
      <button
        type="button"
        className="outline-btn"
        onClick={open}
        aria-haspopup="dialog"
        aria-label="Your plans"
      >
        <FolderHeart aria-hidden /> <span className="btn-label">Your plans</span>
      </button>
      <dialog ref={dialog} className="picker" aria-labelledby="picker-title">
        <div className="picker-body">
          <div className="picker-head">
            <h2 id="picker-title">Your plans</h2>
            <button type="button" className="icon-btn" onClick={close} aria-label="Close">
              <X aria-hidden />
            </button>
          </div>

          <YourPlans plans={plans} onChoose={choose} />
          <SamplePlans onChoose={choose} />

          <Link className="text-btn" href="/plans">
            Manage plans on this device <ChevronRight aria-hidden />
          </Link>
        </div>
      </dialog>

      {opening && (
        <LoadingScreen
          title="Opening your plan"
          steps={[
            `Opening ${opening}`,
            'Fetching the latest version',
            'Lining up what is due next',
          ]}
        />
      )}
    </>
  )
}
