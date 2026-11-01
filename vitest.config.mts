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
    include: ['tests/**/*.test.{ts,tsx}'],
    env: { AI_PROVIDER: 'fake', DB_PROVIDER: 'memory', RATE_LIMIT_ENABLED: 'true', CRON_SECRET: 'test-cron-secret' },
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/api/**', 'scripts/check-secrets.ts'],
      // Thin network adapters: exercised by `pnpm smoke` against real services, not by unit tests.
      // planRepository.ts holds types only.
      exclude: ['lib/server/ai/gemini.ts', 'lib/server/db/supabaseRepository.ts', 'lib/server/db/planRepository.ts'],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 85,
        'lib/domain/**': { lines: 98, branches: 88 },
        'lib/server/services/**': { lines: 95 },
      },
    },
  },
})
