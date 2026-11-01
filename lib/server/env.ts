import 'server-only'
import { z } from 'zod'

const optional = z.string().trim().min(1).optional().catch(undefined)

const Env = z
  .object({
    AI_PROVIDER: z.enum(['gemini', 'fake']).default('gemini'),
    DB_PROVIDER: z.enum(['supabase', 'memory']).default('supabase'),
    GEMINI_API_KEY: optional,
    GEMINI_MODEL: optional,
    SUPABASE_URL: optional,
    SUPABASE_SECRET_KEY: optional,
    RATE_LIMIT_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    RATE_LIMIT_SALT: optional,
    CRON_SECRET: optional,
    NEXT_PUBLIC_APP_URL: optional,
  })
  .superRefine((e, ctx) => {
    const need = (name: keyof typeof e, when: boolean) => {
      if (when && !e[name]) ctx.addIssue({ code: 'custom', path: [name], message: 'missing' })
    }
    need('GEMINI_API_KEY', e.AI_PROVIDER === 'gemini')
    need('GEMINI_MODEL', e.AI_PROVIDER === 'gemini')
    need('SUPABASE_URL', e.DB_PROVIDER === 'supabase')
    need('SUPABASE_SECRET_KEY', e.DB_PROVIDER === 'supabase')
    need('RATE_LIMIT_SALT', e.DB_PROVIDER === 'supabase')
  })
type Env = z.infer<typeof Env>

let cached: Env | undefined

/** Parsed environment, validated on first use. Fails fast naming missing variables only, never their values. */
export function env(): Env {
  if (cached) return cached
  const parsed = Env.safeParse(process.env)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))]
    throw new Error(`Missing or invalid environment variables: ${names.join(', ')}`)
  }
  return (cached = parsed.data)
}

/** Tests change process.env between cases; this forgets the cached parse. */
export function resetEnv() {
  cached = undefined
}
