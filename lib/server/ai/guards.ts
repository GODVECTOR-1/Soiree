import 'server-only'

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi
const DOMAIN = /\b[a-z0-9-]+\.(?:com|in|net|org|io|co|app|dev|xyz|info|biz|me|shop)\b(?:\/\S*)?/gi
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const PHONE = /\+?\d[\d\s().-]{7,}\d/g
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu
const SHOUTING = /\b[A-Z]{4,}\b/g
const NUMBER = /\d[\d,]*(?:\.\d+)?/g

/** Replace a phone-like match only when it has 10+ digits, so dates and amounts survive. */
const phone = (s: string, by: string) =>
  s.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? by : m))

/** Remove personal identifiers (URLs, emails, phone numbers) from user text before it reaches a prompt. */
export const redact = (text: string) =>
  phone(
    text.replace(URL_RE, '[link removed]').replace(EMAIL, '[email removed]'),
    '[number removed]',
  )

/** Untrusted text for a prompt: identifiers redacted, control characters removed, truncated, angle brackets escaped. */
export const cleanInput = (text: string, max = 600) =>
  redact(text).replace(CONTROL, '').slice(0, max).replace(/</g, '&lt;').replace(/>/g, '&gt;')

function deepClean(value: unknown): unknown {
  if (typeof value === 'string') return cleanInput(value)
  if (Array.isArray(value)) return value.map(deepClean)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepClean(v)]))
  return value
}

/** Wrap user-provided fields as untrusted data. Every string inside is cleaned first. */
export const userData = (value: unknown) =>
  `<user_data>\n${JSON.stringify(deepClean(value))}\n</user_data>`

/** Trusted, code-computed facts. `<` is escaped inside the JSON so nothing can close the tag. */
export const factsBlock = (facts: unknown) =>
  `<facts>${JSON.stringify(facts).replace(/</g, '\\u003c')}</facts>`

/**
 * Make generated text safe to show: no URLs, emails, phone numbers, markup brackets, emojis or ALL-CAPS runs,
 * whitespace collapsed, length capped.
 */
export function cleanOutput(text: string, max: number): string {
  const stripped = phone(text.replace(URL_RE, '').replace(EMAIL, '').replace(DOMAIN, ''), '')
  return stripped
    .replace(/[<>]/g, '')
    .replace(EMOJI, '')
    .replace(SHOUTING, (w) => w[0] + w.slice(1).toLowerCase())
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
}

/** Every number written in a text (commas removed, so "₹3,00,000" is 300000). */
export const numbersIn = (text: string) =>
  (text.match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, '')))

/** All numbers in a facts object, including those inside strings, plus their absolute values. */
export function factNumbers(facts: unknown, out = new Set<number>()): Set<number> {
  if (typeof facts === 'number') out.add(facts).add(Math.abs(facts))
  else if (typeof facts === 'string') numbersIn(facts).forEach((n) => out.add(n))
  else if (Array.isArray(facts)) facts.forEach((f) => factNumbers(f, out))
  else if (facts && typeof facts === 'object')
    Object.values(facts).forEach((f) => factNumbers(f, out))
  return out
}

/** Number guard: true when every number in `text` appears in the facts. */
export const numbersOk = (text: string, facts: unknown) => {
  const allowed = factNumbers(facts)
  return numbersIn(text).every((n) => allowed.has(n))
}
