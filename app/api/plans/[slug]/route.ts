import { withHandler } from '@/lib/server/http/handler'
import { getPlan } from '@/lib/server/services/getPlan'

export const runtime = 'nodejs'
export const maxDuration = 60

/** The current version and history. Weak ETag; 304 when it matches. */
export const GET = withHandler({ name: 'plans.get', limit: 'read' }, async ({ c, req, params }) => {
  const { plan, etag } = await getPlan(c, params.slug ?? '')
  const headers = { etag, 'cache-control': 'private, no-cache' }
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return Response.json(plan, { headers })
})
