'use client'

import { useEffect } from 'react'
import Link from 'next/link'

type Props = { error: Error & { digest?: string }; reset: () => void }

/**
 * Shown when a page throws while rendering: a plain message, a retry, and a way home. The error itself goes to the
 * console; the visitor sees only the reference Next attaches to server errors.
 */
export default function ErrorPage({ error, reset }: Props) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="landing center-page" id="main">
      <div>
        <span className="eyebrow">Something went wrong</span>
        <h1>This page hit a snag</h1>
        <p className="muted" role="alert">
          Your plans are safe. Try again, or head back to the start.
          {error.digest && ` (Ref ${error.digest})`}
        </p>
        <div className="hero-actions">
          <button className="primary-btn" onClick={reset}>
            Try again
          </button>
          <Link className="outline-btn" href="/">
            Back to Soirée
          </Link>
        </div>
      </div>
    </main>
  )
}
