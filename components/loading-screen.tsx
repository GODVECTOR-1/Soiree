'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SkyGradient } from '@/components/sky-gradient'

const STEP_MS = 2400

type Props = { title: string; steps: string[]; variant?: 'page' | 'inline' }

/**
 * The full-window variant is a modal <dialog>: while it shows, the page behind is inert (no tabbing or reading into
 * it), and Esc does not dismiss it, since the work it waits for cannot be cancelled.
 */
function PageOverlay({ title, children }: { title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    if (!d || d.open) return
    if (typeof d.showModal === 'function') d.showModal()
    else d.setAttribute('open', '') // environments without modal dialogs (tests)
  }, [])
  return (
    <dialog
      ref={dialog}
      className="loading loading-page"
      aria-label={title}
      onCancel={(e) => e.preventDefault()}
    >
      {children}
    </dialog>
  )
}

/**
 * Loading state on the animated sky (it swirls toward the cursor). `page` fills the window; `inline` is a panel that
 * sits where the result will appear. The title's words rise in, dots pulse, a bar sweeps, and the step line rotates.
 * Screen readers hear the title once (the rotating steps are visual only, so they don't chatter).
 */
export function LoadingScreen({ title, steps, variant = 'page' }: Props) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (steps.length < 2) return
    const id = window.setInterval(() => setI((n) => (n + 1) % steps.length), STEP_MS)
    return () => window.clearInterval(id)
  }, [steps.length])

  const content = (
    <>
      <SkyGradient
        style={{ position: 'absolute', inset: 0, height: '100%', aspectRatio: 'auto' }}
      />
      <div className="loading-card">
        {variant === 'page' && <span className="loading-brand">Soirée</span>}
        <p className="loading-title" role="status">
          {title.split(' ').map((word, n) => (
            <span key={n} style={{ animationDelay: `${n * 90}ms` }}>
              {word}{' '}
            </span>
          ))}
          <span className="loading-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </p>
        <p key={i} className="loading-step" aria-hidden>
          {steps[i]}
        </p>
        <span className="loading-bar" aria-hidden />
      </div>
    </>
  )

  if (variant === 'page') return <PageOverlay title={title}>{content}</PageOverlay>
  return <div className="loading loading-inline">{content}</div>
}
