import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/** False on the server and during hydration, true after. Gate browser-only reads (storage, today) on it. */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false)
}
