'use client'

import { useState, type FormEvent } from 'react'
import { Heart } from 'lucide-react'
import { Heading, type ViewProps } from '@/components/plan-views'
import { LoadingScreen } from '@/components/loading-screen'
import { LIMITS, type Idea } from '@/lib/schemas'
import { savedFirst } from '@/lib/domain/overview'
import { errorMessage, regenerateIdeas } from '@/lib/api'

type CardProps = { idea: Idea; canEdit: boolean; onToggleSave: () => void }

function IdeaCard({ idea: i, canEdit, onToggleSave }: CardProps) {
  return (
    <article className="idea-card">
      <span className="eyebrow">{i.kind}</span>
      <h3>{i.title}</h3>
      <p>{i.blurb}</p>
      <footer>
        {i.fitsPriority ? <span className="fits">★ Fits {i.fitsPriority}</span> : <span />}
        {canEdit && (
          <button
            className="save-btn"
            aria-pressed={i.saved}
            aria-label={`Save ${i.title}`}
            onClick={onToggleSave}
          >
            <Heart size={18} aria-hidden />
          </button>
        )}
      </footer>
    </article>
  )
}

/** Regenerate with optional feedback; saved ideas are kept by the server. */
function useRegenerate({ slug, token, onAction }: Pick<ViewProps, 'slug' | 'token' | 'onAction'>) {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const regenerate = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || busy) return
    setBusy(true)
    setError('')
    try {
      const fresh = await regenerateIdeas(slug, token, feedback.trim())
      await onAction(
        { type: 'ideas', ideas: fresh },
        'New ideas are ready. Your saved ideas stayed.',
      )
      setFeedback('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return { feedback, setFeedback, busy, error, regenerate }
}

export function IdeasView({ slug, token, version, canEdit, onAction }: ViewProps) {
  const { feedback, setFeedback, busy, error, regenerate } = useRegenerate({
    slug,
    token,
    onAction,
  })

  return (
    <section className="detail detail-wide">
      <Heading eyebrow="Made for you" title="Personal touches that fit">
        Keep the ones that feel like you. Saved ideas move to the top.
      </Heading>
      {canEdit && token && (
        <form className="feedback-row" onSubmit={regenerate}>
          <label>
            <span className="field-hint">What should new ideas lean toward? (optional)</span>
            <input
              value={feedback}
              maxLength={LIMITS.messageChars}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="More outdoor, less formal"
            />
          </label>
          <button className="outline-btn" type="submit" disabled={busy}>
            {busy ? 'Finding new ideas…' : 'Regenerate ideas'}
          </button>
        </form>
      )}
      {busy && (
        <LoadingScreen
          variant="inline"
          title="Finding new ideas"
          steps={[
            'Reading your vibes and needs',
            'Keeping the ideas you saved',
            'Matching ideas to your priorities',
          ]}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="idea-grid">
        {savedFirst(version.ideas).map((i) => (
          <IdeaCard
            key={i.id}
            idea={i}
            canEdit={canEdit}
            onToggleSave={() => onAction({ type: 'idea', id: i.id })}
          />
        ))}
      </div>
    </section>
  )
}
