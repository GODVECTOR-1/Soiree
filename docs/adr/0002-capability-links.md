# ADR 0002: Capability links instead of accounts

Status: accepted

## Context

Planners want to start in two minutes and share with family or a committee. Accounts add friction, email, password
resets and personal data we do not need.

## Decision

- Each plan has a public view link (`/s/{slug}`) and a secret edit link (`/plan/{slug}#edit={token}`).
- The token is 32 random bytes; only its SHA-256 is stored and compared in constant time. It travels in the
  `x-edit-token` header, never in a query string. Putting it in the URL fragment keeps it out of server logs and
  `Referer`, and the client strips it from the address bar after saving it.
- Demo plans (`demo-*`) are generated on read and refuse writes with 403.

## Consequences

- No cookies means no CSRF surface. The trade-off is that the token lives in `localStorage` (see SECURITY.md).
- Losing the edit link means losing edit access. "Copy edit link" in the header makes it easy to keep a copy.
- Anyone holding the edit link can edit; there are no per-person permissions.
