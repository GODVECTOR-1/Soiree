import { defineConfig, devices } from '@playwright/test'

const PORT = 3200

/** E2E + axe against the real routes with keyless providers (run `pnpm build` first). */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { AI_PROVIDER: 'fake', DB_PROVIDER: 'memory', RATE_LIMIT_ENABLED: 'false', NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}` },
  },
})
