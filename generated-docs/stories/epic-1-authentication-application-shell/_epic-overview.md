# Epic 1 — Authentication & Application Shell

**Slug:** epic-1-authentication-application-shell
**Requirements:** R1, R2, NFR1, NFR2, NFR3, NFR4, NFR5, NFR6, NFR7, NFR8
**Depends on:** (none)
**Introduces shared surface:** yes — Story 1 creates the session provider and Story 3 creates the `(app)` protected route group/layout that every later-epic page nests under.

## Summary

BFF session-cookie login with credential-vs-connectivity error states, role-based landing routing (Importer → Dashboard, Approver → Transactions), and the app-wide shell (nav, role-gated visibility, session lifecycle, privacy-policy link) carrying the cross-cutting accessibility, responsive, error-UX, and session NFRs.

## Stories

| # | Title | Route | Target file | Infra-only | Reqs |
|---|---|---|---|---|---|
| 1 | BFF session proxy and auth foundation | — | `web/src/app/api/auth/[...route]/route.ts` | yes | R1, NFR5 |
| 2 | Login screen with credential and connectivity error states | `/login` | `web/src/app/login/page.tsx` | no | R1, R2, NFR5 |
| 3 | Role-based landing routing and route protection | `/` | `web/src/app/(app)/layout.tsx` | no | R1, NFR5 |
| 4 | Application shell with role-gated navigation and sign-out | `/` | `web/src/components/shell/AppShell.tsx` | no | R1, NFR1, NFR3, NFR4 |
| 5 | Session lifecycle — idle warning and timeout handling | `/` | `web/src/components/shell/SessionTimeout.tsx` | no | NFR5, NFR6 |

## Non-goals

- No sign-up, password reset, or forgotten-password recovery flow
- No single sign-on (SSO) or multi-factor authentication
- No user-management or role/page-management screens — roles come from the backend as-is
- No own-profile editing beyond viewing

## Spec gaps to resolve during BUILD

- **Story 1 / Story 5:** auth-api.yaml documents the session cookie but no token-refresh/session-extension endpoint → idle/absolute timeout (NFR6) enforced client-side only.
- **Story 1:** UserInfoRead example returns `RolesString='Viewer'`, not Importer/Approver — live role names driving landing routing unconfirmed.
- **Story 2:** brief requires lockout after 5 failed attempts (15-min cooldown); spec documents only a plain 401 with no lockout/cooldown response shape.

## Build notes

- **Login field:** brief says email; API `LoginRequest` uses `Username`/`Password`. Field labelled "email", mapped to `Username` in the proxy.
- **Reuse:** API client (`web/src/lib/api/client.ts`), ToastContext, Shadcn primitives (button/card/input/label), Zod schemas (`web/src/lib/validation/schemas.ts`). Add session provider in root layout; do not nest a second provider tree.
