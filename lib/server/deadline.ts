import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage<number>()

/** Run `fn` with a request deadline that every AI call respects, so slow models fall back instead of timing out the function. */
export const withDeadline = <T>(budgetMs: number, fn: () => Promise<T>) =>
  store.run(Date.now() + budgetMs, fn)

/** Milliseconds left before the current request's deadline (Infinity outside a request). */
export function timeLeft(): number {
  const deadline = store.getStore()
  return deadline === undefined ? Infinity : deadline - Date.now()
}
