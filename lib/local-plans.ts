import { z } from 'zod'

// Browser only. Edit tokens live in localStorage (accepted trade-off: no cookies, no third-party scripts, strict CSP).

const Entry = z.object({ slug: z.string(), title: z.string(), eventType: z.enum(['wedding', 'birthday', 'community']), date: z.string() })
export type LocalPlan = z.infer<typeof Entry>

const tokenKey = (slug: string) => `plan-token:${slug}`
const INDEX = 'plan-index'

function read<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

function write(fn: () => void) {
  try {
    fn()
  } catch {
    // Storage full or blocked: the plan still works for this visit.
  }
}

export const getToken = (slug: string) => read(() => localStorage.getItem(tokenKey(slug)), null)

export const saveToken = (slug: string, token: string) => write(() => localStorage.setItem(tokenKey(slug), token))

/** Plans this browser can edit, most recent first. */
export const listLocalPlans = (): LocalPlan[] =>
  read(() => z.array(Entry).catch([]).parse(JSON.parse(localStorage.getItem(INDEX) ?? '[]')), [])

/** Add or refresh a plan in the local index. */
export const rememberPlan = (p: LocalPlan) =>
  write(() => localStorage.setItem(INDEX, JSON.stringify([p, ...listLocalPlans().filter((x) => x.slug !== p.slug)])))

/** Forget a plan on this device: drops the token and the index entry. The plan itself stays on the server. */
export const forgetPlan = (slug: string) =>
  write(() => {
    localStorage.removeItem(tokenKey(slug))
    localStorage.setItem(INDEX, JSON.stringify(listLocalPlans().filter((x) => x.slug !== slug)))
  })
