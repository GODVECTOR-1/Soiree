'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlanInput } from '@/lib/schemas'
import { createPlan, errorMessage } from '@/lib/api'
import { rememberPlan, saveToken } from '@/lib/local-plans'

/**
 * Creates the plan, remembers it on this device and opens it by its edit link. `onCreated` runs just before
 * navigating (the wizard clears its draft there). Failures leave a plain-language `error` and allow a retry.
 */
export function useCreatePlan(onCreated: () => void) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState('')

  const create = async (draft: PlanInput) => {
    const parsed = PlanInput.safeParse(draft)
    if (!parsed.success) {
      setError('Something is missing. Go back and check the basics.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { slug, editToken } = await createPlan(parsed.data)
      saveToken(slug, editToken)
      const { title, eventType, date } = parsed.data
      rememberPlan({ slug, title, eventType, date })
      onCreated()
      router.push(`/plan/${slug}#edit=${editToken}`)
    } catch (e) {
      setError(errorMessage(e))
      setFailed(true)
      setBusy(false)
    }
  }

  return { busy, failed, error, create }
}
