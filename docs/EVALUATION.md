# Evaluation

All numbers below come from the last local run on 1 Nov 2026 (tests and coverage re-run after the Challenge 5 feature pass) (Windows 11, Node 24.18, pnpm 12.16), in keyless mode
(`AI_PROVIDER=fake DB_PROVIDER=memory`) unless marked "real". Real runs are local `next start` against hosted Supabase
and Gemini, so they include internet round trips; re-measure on Vercel with `BASE_URL=https://your-app pnpm smoke`.

## 1. Criteria and evidence

| Criterion | Evidence | Result |
|---|---|---|
| Problem statement | Budgets (`lib/domain/allocate.ts`), timelines with priority labels, calendar reminders and a day-of run sheet (`lib/domain/timeline.ts`, `calendar.ts`, `dayof.ts`), vendor checklists where users add vendors, record contacts and track quotes against the plan (`lib/domain/vendors.ts`), personal ideas (`lib/server/services/generate.ts`), for weddings, birthdays and community events, with a GenAI assistant (`app/api/plans/[slug]/ask`) | Every feature in the Challenge 5 brief maps to a route and a test (table 2, and the alignment table in `README.md`) |
| Code quality | Pure domain in `lib/domain/` (no Node or browser APIs); `lib/server/**` all import `server-only`; Zod contract in `lib/schemas.ts`; two interfaces only (`AiProvider`, `PlanRepository`); 3 ADRs in `docs/adr/` | `pnpm typecheck`: 0 errors. `pnpm lint`: 0 problems. Largest file in `lib/` is 195 lines (`lib/domain/scenarios.ts`) |
| Security | `SECURITY.md`; hashed tokens (`lib/server/security/tokens.ts`); RLS with no policies (`supabase/migrations/0001_init.sql`); rate limits and quotas (`lib/server/security/rateLimit.ts`); injection and output guards (`lib/server/ai/guards.ts`); nonce CSP (`proxy.ts`); `scripts/check-secrets.ts`; 90-day retention cron (`vercel.json`) | `tests/security/security.test.ts`: 11 passed (incl. vendor contacts never reach the model). `pnpm check:secrets`: pass. `pnpm audit --prod --audit-level high`: 0 high or critical (1 documented ignore, 19 moderate and 3 low remain, all transitive) |
| Efficiency (real Gemini + real Supabase, single run, 2 Nov morning) | Production config from `.env.local`; 17-step end-to-end script | Create 11.6 s (AI calls 2.6 to 6.0 s each, all first-attempt); read 607 ms; what-if 4.8 s; apply 1.2 s; 16 of 17 steps passed. Ask failed with Google 429: the free tier allows 20 requests per day per model (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), and earlier tests had used them. Fallbacks kept creation and what-ifs working under the 429s |
| Efficiency (real Gemini, single run, memory store) | `gemini-3.6-flash`, no thinking, 50 s request budget (`lib/server/deadline.ts`) | Create 45.9 s (allocation review 20.8 s, timeline 6.1 s, ideas 19.9 s, vendor questions timed out at 25 s and fell back to templates); what-if 3.9 s; custom what-if 10.6 s; ask 14.3 s (one provider error, retry succeeded). Over the create and ask budgets: model latency, not code. `gemini-3.8-flash` took 36 to 45 s per trivial call or timed out |
| Efficiency | Code does all arithmetic; Phase B model calls run in parallel; token caps per task (`lib/server/constants.ts`); one `get_plan` round trip per request; weak ETag and 304; minimal thinking level | Smoke, 20 runs, keyless (`pnpm smoke`): create p50 16 ms / p95 20 ms; read 15 / 15; what-if 16 / 17; edit 16 / 17; ask 16 / 17. Budgets: 15 s, 300 ms, 10 s, 300 ms, 6 s. 304 confirmed by route test and live `curl` |
| Testing | `tests/unit`, `tests/property` (fast-check), `tests/service`, `tests/routes`, `tests/security`, `e2e/a11y.spec.ts`; CI in `.github/workflows/ci.yml` | `pnpm test:coverage`: 88 passed in 8 files. Coverage: all files 97.14% lines, 87.87% branches, 94.11% functions; `lib/domain` 100% lines, 90.43% branches (threshold 90/85); services 98.25% lines (threshold 80). `pnpm e2e`: 4 passed |
| Accessibility | Stable error codes with plain messages (`lib/server/http/errors.ts`); `retryAfterSec` on 429; needs in fields or notes become tasks (`needSeeds` in `lib/domain/timeline.ts`); generated text cleaned of emojis and ALL-CAPS; keyboard-only wizard in e2e | axe (Playwright): 0 serious or critical violations on the landing page, plan overview, what-if draft, timeline with run sheet, vendors with an added vendor and quote, read-only view link and a sample plan. 0 CSP console violations. Priority labels are words with reasons, never colour alone |

Test files: `tests/unit/challenge-features.test.ts` 12, `tests/unit/domain.test.ts` 19, `tests/unit/plan-engine.test.ts` 5, `tests/property/allocator.test.ts` 3
(300 + 300 + 200 generated cases), `tests/service/services.test.ts` 19, `tests/routes/routes.test.ts` 18,
`tests/routes/flow.test.ts` 1, `tests/security/security.test.ts` 11, `e2e/a11y.spec.ts` 4.

## 2. Requirements, endpoints, routes and tests

| Requirement | Endpoint | UI route | Test |
|---|---|---|---|
| Create a plan from the wizard | `POST /api/plans` | `/create` | `tests/routes/routes.test.ts` (POST), `e2e/a11y.spec.ts` (keyboard wizard) |
| Plan opens by edit link, then read-only by view link | `GET /api/plans/:slug` | `/plan/[slug]`, `/s/[slug]` | `routes.test.ts` (GET, ETag/304, 404, expiry), `e2e/a11y.spec.ts` |
| Budget lines always sum exactly | all writes | Budget tab | `tests/property/allocator.test.ts`, `tests/unit/plan-engine.test.ts` |
| A cut protects priorities; flexible and buffer give first | `POST .../whatif` | What-if tab | `allocator.test.ts`, `tests/unit/domain.test.ts` |
| Six scenario kinds; unsupported text is a friendly 422 | `POST .../whatif` | What-if tab | `domain.test.ts` (scenarios), `tests/service/services.test.ts` (custom, validation), `routes.test.ts` (422 community venue) |
| Drafts apply or discard; progress survives Apply | `POST .../apply`, `DELETE .../whatif` | What-if tab | `services.test.ts` (stale then 409, ticked task kept), `tests/routes/flow.test.ts`, `domain.test.ts` (venue rebook) |
| Writes need the token; demos refuse writes | all writes | header and read-only banner | `routes.test.ts` (401, 403, 404) |
| Progress edits with concurrency control | `PATCH .../tasks/:id`, `/vendors/:id`, `/ideas/:id` | Timeline, Vendors, Ideas | `routes.test.ts` (204, 404, whitelist 400, 409) |
| Manual budget that must add up | `PATCH .../budget` | Budget tab (Adjust amounts) | `routes.test.ts`, `services.test.ts` (422) |
| Personal ideas, regenerated with saved ones kept | `POST .../ideas/regenerate` | Ideas tab | `services.test.ts`, `routes.test.ts`, `security.test.ts` (markup stripped) |
| Grounded assistant | `POST .../ask` | Ask drawer | `services.test.ts` (unknown refs dropped, number guard), `security.test.ts` (injection) |
| Creation survives a model outage | `POST /api/plans` | `/create` | `services.test.ts` (all AI calls fail) |
| Needs become tasks | `POST /api/plans` | Timeline tab | `domain.test.ts` (sign language, sensory, halal, access) |
| Task priority labels from context, with reasons | n/a (derived) | Timeline, Overview | `challenge-features.test.ts`, `e2e/a11y.spec.ts` |
| Reminders in the user's own calendar | n/a (browser `.ics`) | Timeline (Add reminders) | `challenge-features.test.ts` (RFC 5545 shape, overdue on today, escaping), `e2e/a11y.spec.ts` (download) |
| Day-of run sheet from arrival time, needs and priorities | n/a (derived) | Timeline (Day-of run sheet) | `challenge-features.test.ts`, `e2e/a11y.spec.ts` (Jain need, start time) |
| Add vendors, record contacts, track quotes against the plan | `POST .../vendors`, `PATCH`/`DELETE .../vendors/:id` | Vendors tab | `routes.test.ts` (201, 401, 400, 422 cap, remove only your own), `challenge-features.test.ts` (quote check, survives Apply), `e2e/a11y.spec.ts` (over-range quote) |
| No secrets in the bundle; CSP | n/a | every page | `security.test.ts` (proxy headers, check-secrets), `pnpm check:secrets`, `e2e/a11y.spec.ts` (0 CSP violations) |
| Retention | `GET /api/cron/cleanup` | n/a | `routes.test.ts` (401 without secret, deletes expired) |
