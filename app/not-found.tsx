import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="landing" id="main" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <span className="eyebrow">404</span>
        <h1 className="serif" style={{ fontSize: 56, margin: '14px 0' }}>That page wandered off</h1>
        <p className="muted">Let&apos;s take you back to the beginning.</p>
        <Link className="primary-btn" href="/">Back to Soirée</Link>
      </div>
    </main>
  )
}
