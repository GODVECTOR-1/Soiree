# Soirée: full-stack and design analysis

> **Historical snapshot (1 Nov 2026, before the backend existed).** The backend, tests and docs described as missing
> below have since been built; see `README.md` and `docs/EVALUATION.md` for the current state.

Date: 1 November 2026. Scope: `E:\Soieer` (v0 frontend plus Antigravity's work), the Antigravity prompt v2, the
`E:\21st` and `E:\CLAUDE CLI` folders. Method: read every source file, diffed against the original
`soiree-event-planner-frontend2.zip`, ran typecheck, lint, tests and the production build, and walked every screen in a
browser at desktop and 375px. Tools used: ui-ux-pro-max (design-system search and UX rules), ponytail (over-engineering
lens), and the gstack autoplan review method (CEO, design and eng lenses with its 6 decision principles).

## 1. Headline findings

1. **There is no backend.** No `app/api`, no `lib/server`, no Supabase migration, no Gemini code anywhere on the E drive
   or in the user profile. Antigravity completed only part of milestone M0: it added `lib/categories.ts`, the `pnpm`
   scripts, `noUncheckedIndexedAccess`, removed `ignoreBuildErrors` and `@vercel/analytics`.
2. **Antigravity left the build broken.** Removing `ignoreBuildErrors` exposed 3 type errors it did not fix, so
   `pnpm build` failed. There was no ESLint config, so `pnpm lint` failed. `check:secrets`, `seed` and `smoke` point at
   files that do not exist.
3. **The frontend was a demo shell.** 4 of 6 dashboard tabs rendered the same four static rows; the budget ribbon was a
   hardcoded wedding split for every event type; about 60% of `app/page.tsx` was a second, unreachable copy of the
   dashboard; dozens of CSS classes used in markup did not exist (`trust-row`, `task-list`, `idea-row`, footer...).
4. **The v2 prompt is strong on security and contract, but has 6 logic bugs and about 25% removable scope** (section 4).

## 2. What I changed (all verified)

| Area | Before | After |
|---|---|---|
| Build | `pnpm build` failed (3 TS errors), no lint config | typecheck, lint (0 problems), 5 tests and build all pass |
| Design system | one minified CSS line, ~30 missing classes, no focus styles | organized tokens, per-event accents (wedding rose, birthday terracotta, community teal, all 4.5:1), complete component kit, `:focus-visible`, `prefers-reduced-motion`, 44px targets, skip link, z-index scale |
| Typography | `Inter` named but never loaded | Inter self-hosted via `next/font`, Georgia kept for display |
| Landing | dead duplicate dashboard, sample always wedding | dead code deleted, event picker re-themes the page and swaps the sample plan |
| Wizard | no currency or city size (D5), one generic error, hydration risk | City size and Currency added, per-field messages with `aria-invalid`/`aria-describedby`, focus moves to first error, step progress, Enter submits, live summary |
| Dashboard | placeholders | real Overview, Budget (with Adjust mode and live total check), Timeline (date-aware phases), Vendors (status, notes, estimate range, questions, verify note), Ideas (save), What-if (presets, slider, diff table, Protected badges, total check, impacted tasks, Apply/Discard), accessible Ask drawer |
| Engine | wrong community buffer (D4), wrong-line city tier, no exact sums | `lib/plan-engine.ts`: exact-sum allocator (largest remainder), planning-unit rounding, scenario engine, stable task ids |
| Money | `₹300,000` (D7) | `₹3,00,000`, deterministic, no `Intl` |
| Dates | UTC vs local mix (D6), `toLocale*` (D8) | UTC-noon date math, zero `toLocale*` |
| Storage | `any` types, `/plans` showed samples only (D9) | typed `plan-store.ts`, `/plans` lists real local plans with remove |
| Seams | none | `PlanAction` + pure `applyAction` reducer: the plan page is the only place that persists, so wiring the backend touches one function |

21st.dev: the `E:\21st` folder is the 21st.dev platform source (Clerk, Supabase, motion). Its effects (aurora, shimmer
buttons) would fight Soirée's calm editorial look and pull in `motion`, so I ported three patterns with zero new
dependencies: CircleProgress (vendor progress ring), TextShimmer (loading text) and Skeleton (CSS only).

ui-ux-pro-max suggested romantic pink with Great Vibes script. I rejected that: it suits wedding-only brands, script
fonts fail legibility at body sizes, and Soirée must also serve birthdays and community fairs. I applied its
accessibility, interaction and responsive checklists instead.

## 3. Remaining issues in the app

| Priority | Issue | Where | Fix |
|---|---|---|---|
| High | No backend: plans live in one browser, share links (`?p=`) carry inputs only, not progress | whole app | the v3 prompt |
| High | "Ask the planner" has no free-text answers yet (shows honest jump-to prompts) | `components/plan-dashboard.tsx` | `/api/plans/:slug/ask` |
| Decided | `@base-ui/react`, `shadcn`, `class-variance-authority`, `clsx`, `tailwind-merge`, `components/ui/button.tsx`, `lib/utils.ts` are unused today | `package.json` | kept on purpose (1 Nov 2026) as the shadcn setup for importing 21st.dev components |
| Medium | Ideas are a static list per event type | `lib/plan-engine.ts` | Gemini ideas |
| Low | Display serif is Georgia: dependable, but generic | `app/globals.css` | optional: a licensed display serif (for example Fraunces) via `next/font` |
| Low | Some page-level inline styles remain on 404 and plans headings | `app/not-found.tsx`, `app/plans/page.tsx` | move to classes when touched |

## 4. Prompt v2 review (gstack lenses plus ponytail)

### Logic bugs (eng)

1. **Apply loses progress.** A draft copies phases, vendors and ideas when the what-if runs. Tasks ticked or vendors
   booked after that are overwritten on Apply. Fix: merge progress by id into the draft inside `apply_version`.
2. **Unstable task ids.** `{phaseKey}-{n}` changes when compression moves a task to "This week", so done flags vanish.
   Fix: ids from the template index.
3. **Buffer is cut last.** Marking Buffer "fixed" means a 20% cut halves Decor and Music while the buffer stays whole
   (observed: Venue -53%, Buffer 0%). Fix: buffer gives in the first tier with flexible lines (now Venue -12%).
4. **Non-vendors become vendors.** Only Buffer and Contingency were excluded; Volunteers and Permits are not vendors.
5. **GET returns every applied version** in full, so the payload grows with each apply. Return the current version plus
   a light history list.
6. **`lib/server/domain` must be browser-safe** (for the mock) while `server-only` guards "everything under lib/server".
   Contradiction. Fix: shared pure code in `lib/domain/`.

### Scope to cut (ponytail)

| Cut | Why | Replacement |
|---|---|---|
| `lib/api.mock.ts` and `NEXT_PUBLIC_USE_MOCKS` | a third code path that tests a fake, not the app | `AI_PROVIDER=fake` plus `DB_PROVIDER=memory`: keyless `pnpm dev` and e2e against real routes |
| `lib/api-contract.ts` parity test | tests that files exist | typed `lib/api.ts` plus route tests |
| `seed-demo.ts` and seeded demo rows | demos can be generated from `samples` on read | `GET /api/plans/demo-*` builds them, read-only, no rows |
| `sonner` | a live-region toast already exists (`.notice`) | reuse it |
| manual `If-None-Match` in the client | the browser revalidates ETags itself | `Cache-Control: private, no-cache` plus `ETag` |
| 6 docs | overlap | README (setup, architecture), SECURITY.md, EVALUATION.md (with test traceability), 3 ADRs |

### Ordering (CEO)

v2 builds every layer before anything is deployable, which risks a judged demo with polished tests and no working app.
v3 reorders so a deployed vertical slice (create, view, what-if with Gemini) exists by M3, and hardening follows.

## 5. Verification log

- `pnpm typecheck`: pass. `pnpm lint`: 0 problems. `pnpm test`: 5 passed (54 budget/tier cases sum exactly, priorities
  unchanged on a 20% cut, lakh formatting, progress kept on apply). `pnpm build`: pass.
- Browser: landing (picker re-themes), wizard at 375px (validation, focus, no horizontal scroll), generated plan,
  community and birthday dashboards, what-if apply (version 2 persisted, toast announced), timeline toggle persisted.
  Console: no errors or hydration warnings.
- Not verified: screen-reader pass with NVDA/VoiceOver, axe scan (arrives with the Playwright milestone).
