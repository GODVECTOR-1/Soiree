# ADR 0001: The LLM proposes, code validates

Status: accepted

## Context

Budgets must add up to the cent, priorities must hold on a cut, and the plan must exist even when the model is slow,
wrong or down. Language models are good at explanation and personalization and unreliable at arithmetic.

## Decision

- All numbers come from `lib/domain` (allocator, scenarios, estimates). The model never produces an amount.
- The model may fine-tune allocation shares only inside guardrails expressed in the Zod schema (within 6 points of
  baseline, priorities never below baseline, floors held, sum 100). Code then converts shares to exact integer amounts.
- After code computes a scenario, the model writes only the 2-3 sentence narrative. A number guard rejects any number
  not present in the facts.
- Every call uses structured JSON output, then Zod validation, one retry with the problems appended, then a templated
  fallback. Creation runs Phase B calls in parallel with `Promise.allSettled`.

## Consequences

- Correctness properties are testable without a model (`tests/property`).
- With Gemini down, creation still succeeds with deterministic content; only regenerate, ask and custom scenarios
  return 502.
- Narratives can be plainer than free generation would allow. That is the price of trust.
