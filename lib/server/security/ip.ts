import 'server-only'
import { createHash } from 'node:crypto'

/**
 * Salted hash of the client IP, from the headers Vercel sets (`x-vercel-forwarded-for`, else `x-real-ip`).
 * The raw IP is never stored or logged; the hash lives only in short-lived rate-limit rows.
 */
export function ipHash(headers: Headers, salt: string): string {
  const raw = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip') ?? ''
  const ip = raw.split(',')[0]?.trim() || 'unknown'
  return createHash('sha256').update(`${salt}:${ip}`).digest('base64url').slice(0, 22)
}
