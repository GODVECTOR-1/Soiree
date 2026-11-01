import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="landing center-page" id="main">
      <div>
        <span className="eyebrow">404</span>
        <h1>That page wandered off</h1>
        <p className="muted">Let&apos;s take you back to the beginning.</p>
        <Link className="primary-btn" href="/">
          Back to Soirée
        </Link>
      </div>
    </main>
  )
}
