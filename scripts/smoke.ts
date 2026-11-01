// End-to-end smoke test against a running server, printing latency against the budgets.
// Usage: BASE_URL=http://localhost:3000 pnpm smoke   (RATE_LIMIT_ENABLED=false on the server for more than 8 creates/hour)

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const RUNS = Number(process.env.SMOKE_RUNS ?? 5)
const budgets: Record<string, number> = {
  create: 15000,
  whatif: 10000,
  ask: 6000,
  read: 300,
  edit: 300,
}
const timings: Record<string, number[]> = {}

async function timed(name: string, path: string, init: RequestInit = {}) {
  const started = performance.now()
  const res = await fetch(BASE + path, init)
  const ms = performance.now() - started
  ;(timings[name] ??= []).push(ms)
  if (!res.ok && res.status !== 204)
    throw new Error(`${name} ${path} -> ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const json = (body: unknown, token?: string): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { 'x-edit-token': token } : {}) },
  body: JSON.stringify(body),
})

const day = (offset: number) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10)
const p95 = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)] ?? 0

async function main() {
  for (let i = 0; i < RUNS; i++) {
    const input = {
      eventType: 'wedding',
      title: `Smoke test ${i}`,
      city: 'Jaipur',
      date: day(120),
      planningStart: day(0),
      guestCount: 150,
      cityTier: 2,
      currency: 'INR',
      totalBudget: 1200000,
      priorities: ['Catering', 'Decor and flowers'],
      vibes: ['Traditional', 'Warm'],
      diet: ['Vegetarian'],
      accessibility: true,
      notes: 'Two-day celebration with a mehendi evening. Grandma uses a wheelchair.',
    }
    const { slug, editToken } = (await timed('create', '/api/plans', json(input))) as {
      slug: string
      editToken: string
    }
    await timed('read', `/api/plans/${slug}`)
    const draft = (await timed(
      'whatif',
      `/api/plans/${slug}/whatif`,
      json({ kind: 'budget_change', value: -20 }, editToken),
    )) as { draft: { version: number } }
    await timed('edit', `/api/plans/${slug}/tasks/wedding-0`, {
      ...json({ done: true }, editToken),
      method: 'PATCH',
    })
    await timed(
      'edit',
      `/api/plans/${slug}/apply`,
      json({ version: draft.draft.version }, editToken),
    )
    await timed(
      'ask',
      `/api/plans/${slug}/ask`,
      json({ question: 'How much is set aside for catering?', history: [] }, editToken),
    )
  }
  let over = false
  console.log(`\nLatency against ${BASE} (${RUNS} runs)\n`)
  console.log('endpoint  p50 ms   p95 ms   budget   ok')
  for (const [name, xs] of Object.entries(timings)) {
    const sorted = [...xs].sort((a, b) => a - b)
    const ok = p95(xs) <= (budgets[name] ?? Infinity)
    over ||= !ok
    console.log(
      `${name.padEnd(9)} ${(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(0).padStart(6)}   ${p95(xs).toFixed(0).padStart(6)}   ${String(budgets[name]).padStart(6)}   ${ok ? 'yes' : 'NO'}`,
    )
  }
  if (over) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
