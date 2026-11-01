'use client'

import { useEffect, useState } from 'react'

/** A short status message that clears itself after `ms`, for a polite live region. */
export function useTimedStatus(ms = 3500) {
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(''), ms)
    return () => clearTimeout(t)
  }, [status, ms])
  return [status, setStatus] as const
}
