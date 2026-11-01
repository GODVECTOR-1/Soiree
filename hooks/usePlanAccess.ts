'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { getToken, saveToken } from '@/lib/local-plans'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

/**
 * Edit access for a plan: the token from `#edit=` (stored, then stripped from the URL so it does not linger in
 * history or get shared), else the one saved on this device. Pass `withToken = false` for view links.
 */
export function usePlanAccess(
  slug: string,
  withToken = true,
): { token: string | null; canEdit: boolean } {
  useEffect(() => {
    if (!withToken) return
    const token = /(?:^#|&)edit=([A-Za-z0-9_-]{20,100})/.exec(window.location.hash)?.[1]
    if (!token) return
    saveToken(slug, token)
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    )
    notify()
  }, [slug, withToken])

  const token = useSyncExternalStore(
    subscribe,
    () => (withToken ? getToken(slug) : null),
    () => null,
  )
  return { token, canEdit: !!token }
}
