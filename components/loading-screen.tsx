'use client'

import { useEffect, useState } from 'react'
import { SkyGradient } from '@/components/sky-gradient'

const STEP_MS = 2400

/**
 * Loading state on the animated sky (it swirls toward the cursor). `page` fills the window; `inline` is a panel that
 * sits where the result will appear. The title's words rise in, dots pulse, a bar sweeps, and the step line rotates.
 * Screen readers hear the title once (the rotating steps are visual only, so they don't chatter).
 */
export function LoadingScreen({
  title,
  steps,
  variant = 'page',
}: {
  title: string
  steps: string[]
  variant?: 'page' | 'inline'
}) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (steps.length < 2) return
    const id = window.setInterval(() => setI((n) => (n + 1) % steps.length), STEP_MS)
    return () => window.clearInterval(id)
  }, [steps.length])

  return (
    <div className={`loading loading-${variant}`}>
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
    </div>
  )
}
