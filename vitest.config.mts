import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': here('./'),
      // `server-only` throws outside a React Server build; tests run server code directly.
      'server-only': here('./tests/stubs/empty.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    env: { AI_PROVIDER: 'fake', DB_PROVIDER: 'memory', RATE_LIMIT_ENABLED: 'true', CRON_SECRET: 'test-cron-secret' },
    coverage: {
      provider: 'v8',
      include: ['lib/domain/**', 'lib/server/**', 'lib/schemas.ts', 'lib/format.ts', 'app/api/**', 'scripts/check-secrets.ts'],
      // Thin network adapters: exercised by `pnpm smoke` against real services, not by unit tests.
      exclude: ['lib/server/ai/gemini.ts', 'lib/server/db/supabaseRepository.ts'],
      thresholds: {
        lines: 75,
        'lib/domain/**': { lines: 90, branches: 85 },
        'lib/server/services/**': { lines: 80 },
      },
    },
  },
})
