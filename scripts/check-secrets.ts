// Fails the build if a secret could reach the browser. Run after `pnpm build`: `pnpm check:secrets`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const SECRET_ENV = ['GEMINI_API_KEY', 'SUPABASE_SECRET_KEY', 'CRON_SECRET', 'RATE_LIMIT_SALT']
/** Shapes of real keys, caught even when the value is not in this environment. */
const KEY_SHAPES = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
]
const PUBLIC_SECRET_NAME = /NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|SALT|PASSWORD)/
// Test fixtures plant fake secrets on purpose.
const SKIP = new Set([
  'node_modules',
  '.next',
  '.git',
  'coverage',
  'test-results',
  'playwright-report',
  'tests',
])

function* files(dir: string, skip = SKIP): Generator<string> {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path, skip)
    else yield path
  }
}

/** Files in `dir` (the client bundle) containing a secret value or a key-shaped string. */
export function findLeaks(dir: string, values: string[]): string[] {
  const secrets = values.filter((v) => v.length >= 8)
  const out: string[] = []
  for (const path of files(dir, new Set())) {
    const text = readFileSync(path, 'utf8')
    if (secrets.some((s) => text.includes(s)) || KEY_SHAPES.some((re) => re.test(text)))
      out.push(path)
  }
  return out
}

/** Source and env files that expose a secret-looking name through a NEXT_PUBLIC_ variable. */
export function findPublicSecretNames(root: string): string[] {
  const out: string[] = []
  for (const path of files(root)) {
    if (!/\.(ts|tsx|js|mjs|json)$|(^|[\\/])\.env/.test(path) || path.endsWith('check-secrets.ts'))
      continue
    if (PUBLIC_SECRET_NAME.test(readFileSync(path, 'utf8'))) out.push(path)
  }
  return out
}

function main() {
  const root = process.cwd()
  const bundle = join(root, '.next', 'static')
  if (!existsSync(bundle)) {
    console.error('check-secrets: run `pnpm build` first (.next/static is missing).')
    process.exit(1)
  }
  const leaks = findLeaks(
    bundle,
    SECRET_ENV.map((n) => process.env[n] ?? ''),
  )
  const names = findPublicSecretNames(root)
  for (const f of leaks)
    console.error(`Secret value or key found in the client bundle: ${relative(root, f)}`)
  for (const f of names) console.error(`Secret-looking NEXT_PUBLIC_ name in: ${relative(root, f)}`)
  if (leaks.length || names.length) process.exit(1)
  console.log('check-secrets: no secrets in the client bundle or NEXT_PUBLIC_ names.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
