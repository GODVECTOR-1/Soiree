import 'server-only'

type Fields = Record<string, string | number | boolean | undefined>

/** Structured one-line logs. Callers pass ids, names, timings and outcomes only: never prompts, notes, tokens or keys. */
export function log(event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...fields }))
}
