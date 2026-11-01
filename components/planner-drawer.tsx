'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { AskResponse } from '@/lib/schemas'
import { askPlanner, errorMessage } from '@/lib/api'
import type { View } from '@/components/plan-dashboard'
import { LoadingScreen } from '@/components/loading-screen'

const prompts: { q: string; view: View }[] = [
  { q: 'What should I book first?', view: 'vendors' },
  { q: 'Where can we make room for live music?', view: 'what-if' },
  { q: 'What is due this month?', view: 'timeline' },
  { q: 'Help me make this more personal', view: 'ideas' },
]

type Turn = { role: 'user' | 'assistant'; text: string; references?: AskResponse['references'] }
const refView: Record<AskResponse['references'][number]['kind'], View> = {
  budget: 'budget',
  task: 'timeline',
  vendor: 'vendors',
  idea: 'ideas',
}

/**
 * Ask drawer: grounded questions with up to 6 turns of history; reference chips open the matching tab. A native modal
 * <dialog> gives the focus trap, Esc to close and an inert page behind it.
 */
export function PlannerDrawer({
  slug,
  token,
  onClose,
  onSelect,
}: {
  slug: string
  token: string | null
  onClose: () => void
  onSelect: (v: View) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])
  const close = () => dialog.current?.close()

  const ask = async (q: string) => {
    const text = q.trim().slice(0, 300)
    if (!token || !text || busy) return
    setBusy(true)
    setError('')
    const history = turns.slice(-6).map((t) => ({ role: t.role, text: t.text.slice(0, 900) }))
    setTurns((ts) => [...ts, { role: 'user', text }])
    setQuestion('')
    try {
      const res = await askPlanner(slug, token, { question: text, history })
      setTurns((ts) => [...ts, { role: 'assistant', text: res.answer, references: res.references }])
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Clicks on the backdrop land on the <dialog> itself; clicks inside land on .drawer-body.
    <dialog
      ref={dialog}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && close()}
    >
      <div className="drawer-body">
        <div className="drawer-head">
          <div>
            <span className="eyebrow">Your planning partner</span>
            <h2 id="drawer-title">Ask the planner</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close planner">
            <X aria-hidden />
          </button>
        </div>
        <p className="serif">
          {token
            ? 'Ask about your budget, timeline, vendors, or ideas. Answers come only from your plan.'
            : 'Start with a question. Each one opens the part of your plan that answers it.'}
        </p>
        <div className="conversation" aria-live="polite">
          {turns.map((t, i) =>
            t.role === 'user' ? (
              <div className="you" key={i}>
                {t.text}
              </div>
            ) : (
              <div className="assistant" key={i}>
                <Sparkles size={15} aria-hidden />
                <div>
                  <span>{t.text}</span>
                  {!!t.references?.length && (
                    <div className="chip-row ref-row">
                      {t.references.map((r) => (
                        <button
                          key={`${r.kind}-${r.id}`}
                          className="chip"
                          onClick={() => onSelect(refView[r.kind])}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <LoadingScreen
              variant="inline"
              title="Looking through your plan"
              steps={[
                'Reading your budget and tasks',
                'Checking vendors and ideas',
                'Answering only from your plan',
              ]}
            />
          )}
          {!token && (
            <div className="assistant">
              <Sparkles size={15} aria-hidden />{' '}
              <span>Open your edit link to ask questions about this plan.</span>
            </div>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {token && (
          <form
            className="question-row"
            onSubmit={(e) => {
              e.preventDefault()
              void ask(question)
            }}
          >
            <label>
              <span className="sr-only">Your question</span>
              <input
                value={question}
                maxLength={300}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Where can we save a little?"
              />
            </label>
            <button className="primary-btn" type="submit" disabled={busy || !question.trim()}>
              Ask
            </button>
          </form>
        )}
        <div className="drawer-links">
          {prompts.map((p) => (
            <button
              key={p.q}
              onClick={() => (token ? void ask(p.q) : onSelect(p.view))}
              disabled={busy}
            >
              {p.q}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  )
}
