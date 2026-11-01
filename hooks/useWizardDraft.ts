'use client'

import { useState } from 'react'
import type { PlanInput } from '@/lib/schemas'
import { blankInput, parseDraft } from '@/lib/plan-form'
import { todayIso } from '@/lib/format'
import { useHydrated } from '@/lib/use-hydrated'

const DRAFT_KEY = 'soiree:wizard'

function restoreDraft(today: string): PlanInput {
  try {
    return parseDraft(sessionStorage.getItem(DRAFT_KEY), today)
  } catch {
    return parseDraft(null, today) // storage blocked
  }
}

/** Session storage is a convenience: a blocked or full store must never break the wizard. */
function storeDraft(draft: PlanInput | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Ignore.
  }
}

/**
 * The wizard's plan in progress, kept in session storage so a refresh does not lose it. Dates and the saved draft
 * only exist in the browser, so they are read after hydration to avoid mismatches.
 */
export function useWizardDraft() {
  const [edits, setEdits] = useState<PlanInput | null>(null)
  const hydrated = useHydrated()
  const today = hydrated ? todayIso() : ''
  const plan = edits ?? (hydrated ? restoreDraft(today) : blankInput)

  const update = (patch: Partial<PlanInput>) => {
    const next = { ...plan, ...patch }
    setEdits(next)
    storeDraft(next)
  }
  const clear = () => storeDraft(null)

  return { plan, today, update, clear }
}
