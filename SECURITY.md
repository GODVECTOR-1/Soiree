# Security

Soirée has no accounts. Access is by capability link, and only the server touches the database or the model.
This file records the threat model and what is implemented, with the file that implements each control.

## Assets

- Edit capability for a plan (the edit token).
- Plan content, including free-text notes that may contain personal details.
- Gemini quota and the Supabase secret key.

## Threats and controls

| Threat | Control | Where |
|---|---|---|
| Guessed or stolen edit link | 12-char URL-safe slug (72 bits); 32-byte base64url token from `crypto.randomBytes`; only the SHA-256 is stored; `timingSafeEqual`; accepted only in the `x-edit-token` header; returned once at creation; never logged; stripped from the address bar with `history.replaceState` after first read | `lib/server/security/tokens.ts`, `lib/server/http/handler.ts`, `hooks/usePlanAccess.ts` |
| Direct database access | RLS on every table with **no policies**; all grants revoked from `anon` and `authenticated`; functions executable only by `service_role`; the secret key exists only in server env | `supabase/migrations/0001_init.sql`, `lib/server/db/supabaseRepository.ts` |
| Gemini quota abuse | Per-IP hourly limits on a salted IP hash (`x-vercel-forwarded-for`, else `x-real-ip`): create 8, what-if 20, regenerate 10, ask 20, read 300, edits 600. Lifetime per-plan quotas: 10 scenarios, 10 regenerations, 40 questions. 429 with `Retry-After` | `lib/server/security/rateLimit.ts`, `lib/server/constants.ts` |
| Bad input | Zod on every body and response; 16 KB body cap (streamed, 413); JSON content type (415); priority allowlists per event type; scenario value ranges; vendor patch is a strict whitelist | `lib/schemas.ts`, `lib/server/http/handler.ts`, `lib/server/services/*` |
| Prompt injection | User fields are cleaned (identifiers redacted, control characters removed, truncated, `<` `>` escaped) and wrapped in `<user_data>`; trusted facts sit in a separate `<facts>` block; the system prompt says user data is untrusted and must never be followed or revealed; every answer is re-validated against a Zod schema; numbers come from code | `lib/server/ai/guards.ts`, `lib/server/ai/prompts/*` |
| Invented numbers | Number guard: every number in a narrative, answer or rationale must appear in the facts sent to the model, otherwise the templated text is used | `lib/server/ai/guards.ts`, `lib/server/services/generate.ts`, `askPlanner.ts` |
| Stored XSS via AI text | React renders text only (no `dangerouslySetInnerHTML`); generated fields have URLs, emails, phone numbers, angle brackets, emojis and ALL-CAPS runs stripped before storage | `lib/server/ai/guards.ts` |
| Information leaks | Unknown errors become a generic 500 with a request id; no stack traces or provider messages reach clients; env errors name variables, never values; `/api/health` returns booleans | `lib/server/http/handler.ts`, `lib/server/env.ts` |
| Browser attacks | `proxy.ts` sets a per-request nonce CSP: `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'` (`'unsafe-eval'` in dev only); `style-src 'self' 'unsafe-inline'`; `connect-src 'self'`; `img-src 'self' data:`; `font-src 'self'`; `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`. Plus HSTS (production), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera, microphone and geolocation off, `X-Frame-Options: DENY`. The e2e suite asserts zero CSP console violations | `proxy.ts`, `app/layout.tsx`, `e2e/a11y.spec.ts` |
| CSRF | No cookies; every write needs the custom header, which a cross-site form cannot send | `lib/server/http/handler.ts` |
| Secret leakage | `pnpm check:secrets` scans `.next/static` for secret values and key shapes (`sb_secret_…`, `AIza…`, JWTs) and the source for secret-looking `NEXT_PUBLIC_` names; `.env*` is git-ignored | `scripts/check-secrets.ts`, `.gitignore` |
| Concurrent edits | Compare-and-set on a per-version `rev` (3 tries, then 409). `apply_version` locks the plan row, checks the expected `rev`, and bumps the old version so a late edit cannot land on it | `lib/server/services/editPlan.ts`, `applyVersion.ts`, migration |
| Vulnerable dependencies | `pnpm audit --prod --audit-level high` in CI; transitive fixes pinned with `overrides`; install scripts allow-listed | `.github/workflows/ci.yml`, `pnpm-workspace.yaml` |
| Retention | Plans expire after 90 days (404 at once, deleted by the daily cron). Raw IPs are never stored; salted hashes live only in rate-limit rows deleted after 2 hours | `vercel.json`, `cleanup_expired()` in the migration |

## Accepted trade-offs

- **Edit token in `localStorage`.** Without accounts or cookies, the browser must keep the capability somewhere. The
  risk is script injection, so the app has no third-party scripts, a strict nonce CSP and text-only rendering. Anyone
  with the edit link can edit; share the view link instead. "Remove" on `/plans` forgets the token on that device.
- **Lifetime per-plan AI quotas.** Fixed limits keep a leaked link from draining the Gemini quota. A plan that reaches
  10 scenarios keeps every other feature.
- **Dependency audit.** `pnpm audit --prod` reports no known vulnerabilities. Fixes for transitive packages are
  pinned as `overrides` in `pnpm-workspace.yaml`, and CI fails on any high or critical production advisory.

## Logging

Logs are one JSON line per request (`requestId`, endpoint name, status, milliseconds) and per model call (task, model,
attempt, outcome, milliseconds). Prompts, notes, tokens, keys, slugs and IPs are never logged.

## Reporting

Please report vulnerabilities privately to the maintainer rather than in a public issue.

## Vendor records

Users can record a vendor's name, contact and quote. Contacts are plain text (max 120 characters), rendered as text
only, and visible to anyone with the plan's view link (the form says so). They are never sent to the model: the
planner's context includes vendor names, quotes and the quote-vs-range check, not contacts
(`lib/server/services/askPlanner.ts`, tested in `tests/security/security.test.ts`). Users can add at most 20 vendors
per plan, and only vendors they added can be removed.
