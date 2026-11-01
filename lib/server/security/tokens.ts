import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 12-character URL-safe slug (72 random bits). Never starts with the reserved `demo-` prefix. */
export function newSlug(): string {
  const slug = randomBytes(9).toString('base64url')
  return slug.startsWith('demo-') ? newSlug() : slug
}

/** 32-byte base64url edit token. Returned to the creator once; only its hash is stored. */
export const newToken = () => randomBytes(32).toString('base64url')

/** SHA-256 hex of a token. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Constant-time comparison of a presented token with a stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  if (token.length > 100) return false
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
