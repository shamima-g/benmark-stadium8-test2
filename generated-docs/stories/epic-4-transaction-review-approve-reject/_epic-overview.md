# Epic 4 — Transaction Review — Approve & Reject

**Slug:** epic-4-transaction-review-approve-reject
**Depends on:** Epic 1 (shell/auth), Epic 2 (audit-header client pattern), Epic 3 (transactions table)
**Requirements:** R9, R10, BR1, BR2, BR3, BR8, BR9
**epicIntroducesSharedSurface:** false

**Summary:** Approver-only approve and reject actions on Imported transactions — confirmation modal naming the reference (destructive styling, default focus on Cancel), mandatory rejection note with on-blur/on-submit validation, immediate status transition with toast, terminal-state action hiding with a top-of-page banner, and read-only display of rejection notes on rejected records.

## Stories

| # | Title | Route | Target file | Action | Reqs | Coverage |
|---|---|---|---|---|---|---|
| 1 | Approving an imported transaction | `/transactions` | `web/src/app/(app)/transactions/page.tsx` | modify_existing | R9, BR3, BR9 | AC-1..3,5 playwright, AC-4 vitest |
| 2 | Rejecting a transaction with a note | `/transactions` | `web/src/app/(app)/transactions/page.tsx` | modify_existing | R10, BR2, BR3, BR9 | AC-1..4,6 playwright, AC-5 vitest |
| 3 | Hiding actions once a transaction is decided | `/transactions` | `web/src/app/(app)/transactions/page.tsx` | modify_existing | BR1 | AC-1,2,4 playwright, AC-3 vitest |
| 4 | Reading why a transaction was rejected | `/transactions` | `web/src/app/(app)/transactions/page.tsx` | modify_existing | BR8 | AC-1..3 playwright |

All four stories layer onto the Epic-3 Transactions table (row actions + modals); Stories 2–4 build on Story 1's gated row-actions cell. No new per-transaction route (approved at Gate 2b — the brief's §9 workflows are row-level).

## Non-goals

- No bulk approve/reject of multiple transactions at once
- No edit, reopen, or un-approve of a transaction once it reaches a terminal state
- No reassignment, commenting, or approval-delegation workflow between users
- No email or push notification on approval/rejection — feedback is an in-app toast only

## Spec gaps

None. The approve/reject endpoints, the `TransactionId` query param, the `LastChangedUser` audit header, and the `TransactionRejectWrite` body are all documented in `documentation/transactions-api.yaml`.

## Reuse note

Layer onto `web/src/app/(app)/transactions/page.tsx` (do not rebuild Epic 3's pipeline). Approve = `post('/v1/transactions/approve', undefined, lastChangedUser, { requiresAuth })`; reject = `post('/v1/transactions/reject', { UserNote }, lastChangedUser, { requiresAuth })` — the `LastChangedUser` audit-header pattern from Epic 2 Story 4. First consumer of the Epic-1 toast system (`useToast`). Reuse the `alert-dialog` (destructive, default focus Cancel) and `alert` (terminal banner) primitives, and mirror `canExportTransactions` for the Approver-only `canActionTransaction` gate.
