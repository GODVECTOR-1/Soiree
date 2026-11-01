'use client'

import { useState } from 'react'
import type { WhatIfResult } from '@/lib/schemas'
import { discardDraft, errorMessage, runWhatIf } from '@/lib/api'
import { Heading, type ViewProps } from '@/components/plan-views'
import { LoadingScreen } from '@/components/loading-screen'
import { ScenarioControls, type RunScenario } from '@/components/what-if-controls'
import { DraftResult } from '@/components/what-if-draft'

type WhatIfProps = ViewProps & {
  draft: WhatIfResult | null
  onDraft: (d: WhatIfResult | null) => void
  onApply: (d: WhatIfResult) => void
}

/** Runs scenarios on the server; the server's result is the only result (the browser never computes a draft). */
function useScenarioRunner({
  slug,
  token,
  onDraft,
}: Pick<WhatIfProps, 'slug' | 'token' | 'onDraft'>) {
  const [activePreset, setActivePreset] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run: RunScenario = async (s, label = '') => {
    if (!token || busy) return false
    setActivePreset(label)
    setBusy(true)
    setError('')
    try {
      onDraft(await runWhatIf(slug, token, s))
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { activePreset, busy, error, run }
}

/** Scenario lab: presets, priorities, guest slider and free text, then the draft to apply or discard. */
export function WhatIfView(props: WhatIfProps) {
  const { slug, token, input, canEdit, draft, onDraft, onApply } = props
  const { activePreset, busy, error, run } = useScenarioRunner(props)

  const discard = () => {
    onDraft(null)
    if (token) discardDraft(slug, token).catch(() => undefined) // the next what-if replaces it anyway
  }

  return (
    <section className="detail">
      <Heading eyebrow="A living plan" title="Make a change, see the trade-off">
        Test a scenario before it becomes a decision. Nothing changes until you apply it.
      </Heading>
      {canEdit && token ? (
        <ScenarioControls
          input={input}
          busy={busy}
          activePreset={activePreset}
          run={run}
          hasDraft={!!draft}
        />
      ) : (
        <p className="muted">
          You are viewing a shared plan. Scenarios are available to the plan owner.
        </p>
      )}
      {busy && (
        <LoadingScreen
          variant="inline"
          title="Working out the trade-off"
          steps={[
            'Recomputing every line in code',
            'Protecting your priorities',
            'Writing a short explanation',
          ]}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {draft && !busy && (
          <DraftResult
            draft={draft}
            currency={input.currency}
            onApply={() => onApply(draft)}
            onDiscard={discard}
          />
        )}
      </div>
    </section>
  )
}
