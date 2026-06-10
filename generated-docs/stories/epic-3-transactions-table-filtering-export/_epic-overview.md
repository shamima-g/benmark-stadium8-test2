# Epic 3 — Transactions Table, Filtering & Export

**Slug:** epic-3-transactions-table-filtering-export
**Depends on:** Epic 1 (shell/auth), Epic 2 (file management — drill-through deep-link)
**Requirements:** R6, R7, R11, R16, R17, R18, BR6, BR9, BR11
**epicIntroducesSharedSurface:** false

**Summary:** The top-level Transactions table (paginated, sortable, all specified columns) with the full filter set (status, file, date range, amount range, free-text on reference/account), active filter chips with clear-all, distinct empty/no-results states, read-only mode for both roles here, and Approver CSV export of exactly the filtered set.

## Stories

| # | Title | Route | Target file | Action | Reqs | Coverage |
|---|---|---|---|---|---|---|
| 1 | Transactions table — columns, sorting, pagination, read-only | `/transactions` | `web/src/app/(app)/transactions/page.tsx` | modify_existing | R6, R16, R17, BR9, BR11 | AC-1..5 playwright, AC-6 vitest |
| 2 | Filter & search + active chips + deep-link in | `/transactions` | `web/src/app/(app)/transactions/page.tsx` | modify_existing | R7, R18, BR11 | AC-1..4 playwright, AC-5..6 vitest |
| 3 | Approver CSV export of the filtered set | `/transactions` | `web/src/app/(app)/transactions/page.tsx` | modify_existing | R11, BR6, BR9 | AC-1..3 playwright, AC-4 vitest |

All three stories build out the same `/transactions` page incrementally: Story 1 the read-only table, Story 2 the filter set, Story 3 the Approver-only export.

## Non-goals

- No bulk approve or reject from the table — single-transaction actions are Epic 4
- No saved or shareable filter presets
- No server-side export, scheduled exports, or formats other than CSV
- No column customisation, hiding, or reordering

## Spec gaps

No new gaps. Filtering/sort/pagination and CSV export are all client-side, consistent with the Epic-2-approved decisions: `GET /v1/transactions` exposes no query params, and there is no export endpoint (the brief specifies client-side CSV generation). Recorded for traceability only.

## Reuse note

Generalise Epic 2's pure helpers (`web/src/lib/file-logs/{sort,pagination}.ts`) into shared `web/src/lib/table/` helpers consumed by both the File Logs dashboard and the Transactions table; reuse `FileStatusBadge`, the active-filter-chip + Clear-all pattern, and the native-anchor drill-through. Honour the `/transactions?fileLogId=<id>&status=<Status>` deep-link contract from `web/src/lib/files/statusCounts.ts`.
