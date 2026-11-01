export const runtime = 'nodejs'

const names = ['AI_PROVIDER', 'DB_PROVIDER', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'RATE_LIMIT_SALT', 'CRON_SECRET'] as const

/** Liveness plus which variables are set. Presence booleans only, never values. */
export function GET() {
  const present = Object.fromEntries(names.map((n) => [n, Boolean(process.env[n]?.trim())]))
  return Response.json({ ok: true, env: present }, { headers: { 'cache-control': 'no-store' } })
}
