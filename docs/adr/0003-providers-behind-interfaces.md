# ADR 0003: Providers behind two interfaces

Status: accepted

## Context

Tests must run with no network, local development must work with no keys, and e2e tests must hit the real routes.

## Decision

- Exactly two interfaces: `AiProvider` (Gemini, Fake) and `PlanRepository` (Supabase, InMemory). Nothing else gets an
  interface.
- `lib/server/container.ts` picks implementations from `AI_PROVIDER` and `DB_PROVIDER`; tests install their own
  container with `setContainer`.
- Only `lib/server/db/` imports Supabase and only `lib/server/ai/gemini.ts` imports `@google/genai`.
- The in-memory repository mirrors the SQL semantics (expiry, one draft per plan, compare-and-set, atomic apply), and
  the fake provider goes through the same validate-and-retry policy as Gemini.

## Consequences

- `AI_PROVIDER=fake DB_PROVIDER=memory pnpm dev` runs the full app with no keys; CI and Playwright use the same mode.
- The thin adapters (`gemini.ts`, `supabaseRepository.ts`) are excluded from unit coverage and exercised by
  `pnpm smoke` against real services.
- Behavior drift between the two repositories is a risk; the SQL functions and the memory class carry matching comments.
