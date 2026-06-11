# Build Time Estimates

_Generated: 2026-06-11 06:11Z_

Predicted active build time per story, authored at the planning gate.
Actuals are filled in from `timing-summary.json` once a story is built
(run `node .claude/scripts/timing-report.js` first to refresh them).
Complexity: **S** small · **M** medium · **L** large.

## Epic 1

| Story | Title | Complexity | Estimate | Actual | Variance | Driver |
| --- | --- | :---: | --- | --- | --- | --- |
| 1 | BFF session proxy and auth foundation | L | 45m | — | — | Net-new BFF proxy route handlers + session provider + typed auth module; cookie relay and credential/connectivity error typing, no existing pattern to reuse — the shared surface the rest of the epic depends on. |
| 2 | Login screen with credential and connectivity error states | M | 30m | — | — | Single form from existing Shadcn primitives, but two distinct error states (401 vs connectivity+retry), keyboard/a11y wiring, and a spec gap (lockout) to resolve. |
| 3 | Role-based landing routing and route protection | M | 35m | — | — | Creates the (app) protected route group every later page nests under; role-to-landing mapping, redirect-when-signed-out, and in-page permission-denied banner — routable with 3 Playwright ACs. |
| 4 | Application shell with role-gated navigation and sign-out | M | 35m | — | — | Persistent nav with role-gated visibility, identity display, sign-out + back-button invalidation, responsive collapse, and a11y — broad surface but composed from primitives. |
| 5 | Session lifecycle — idle warning and timeout handling | M | 30m | — | — | Idle/absolute timers, 60s countdown warning, 401-driven sign-out; client-side only (spec gap, no refresh endpoint) and timer-based tests are fiddly. |
| **Subtotal** | | | **2h 55m** | **—** | — | |

## Epic 2

| Story | Title | Complexity | Estimate | Actual | Variance | Driver |
| --- | --- | :---: | --- | --- | --- | --- |
| 1 | File Logs Dashboard | L | 55m | — | — | Full data table replacing the placeholder — server-fetched list plus client-side sort, 5/10/20/50 pagination, multi-field filter bar with chips + clear-all, two distinct empty states, status badges, and row drill-through (6 ACs). |
| 2 | Upload a Transaction File | M | 40m | — | — | Drag-and-drop dropzone + picker fallback, File Setting fetch, octet-stream upload with progress, success/retry, connectivity-vs-validation error split, and Importer-only route gating. |
| 3 | File Detail — Summary & Status-Count Drill-Through | M | 40m | — | — | New shared /files/[id] page: fetch + client-side status-count summary (Total/Imported/Approved/Rejected), count drill-through links, BR4 work-in-progress banner, loading/not-found states. |
| 4 | File Lifecycle — Validation Errors, Retry & Cancel (Importer) | L | 50m | — | — | Layers Importer-only mutations onto file detail: dynamic validation-error grid from a JsonArray + column endpoint, retry-validation, destructive cancel-confirm modal, BR7 approved-transaction block (client-side derived), and full role-gating of all three controls. |
| **Subtotal** | | | **3h 5m** | **—** | — | |

## Epic 3

| Story | Title | Complexity | Estimate | Actual | Variance | Driver |
| --- | --- | :---: | --- | --- | --- | --- |
| 1 | Transactions table — columns, sorting, pagination and read-only view | L | 50m | — | — | Replaces the placeholder with the full read-only table — 8 columns, single-column sort, 5/10/20/50 pagination, status badges, and loading/error/zero-data states. Lower than the dashboard because the table/sort/pagination primitives are being reused/generalised from Epic 2 rather than built fresh. |
| 2 | Filter and search the transactions, with active filter chips and deep-link in | L | 55m | — | — | Five filter types (status, file, date range, amount range, free-text on reference/account) composed with AND, active chips + Clear-all, a zero-filter-results state, and deep-link parsing of ?fileLogId=&status= initial filters — the heaviest story in the epic. |
| 3 | Approver export of the filtered transactions as CSV | M | 35m | — | — | Approver-only Export control: pure client-side CSV builder (header + escaped rows) over exactly the filtered set, role-gated visibility, disabled-when-empty state, and a filename reflecting active filters + date. |
| **Subtotal** | | | **2h 20m** | **—** | — | |

## Epic 4

| Story | Title | Complexity | Estimate | Actual | Variance | Driver |
| --- | --- | :---: | --- | --- | --- | --- |
| 1 | Approving an imported transaction | M | 40m | — | — | Establishes the Approver-only row-actions cell + the first mutation (approve endpoint, audit header, optimistic status transition, success/error toast — first toast consumer) + confirmation modal naming the reference. Sets the pattern Stories 2-4 reuse. |
| 2 | Rejecting a transaction with a note | M | 40m | — | — | Reject modal with a mandatory rejection note: disabled-until-typed submit, on-blur + on-submit validation (whitespace-only = empty), reject endpoint with UserNote body + audit header, optimistic Rejected transition + toast. |
| 3 | Hiding actions once a transaction is decided | S | 25m | — | — | Presentation/guard logic on top of Stories 1-2: actions render only for Imported rows, terminal-state top-of-page banner, and a concurrent-change guard that dismisses the modal with an explanation. No new endpoints. |
| 4 | Reading why a transaction was rejected | S | 25m | — | — | Read-only display of the persisted rejection note on Rejected rows (expandable/affordance), visible to both roles; non-rejected rows show none. No mutation, no new endpoint. |
| **Subtotal** | | | **2h 10m** | **—** | — | |

## Total

| | Estimate | Actual | Variance |
| --- | --- | --- | --- |
| **All stories** | **10h 30m** | **—** | — |

---

_Source: `generated-docs/timing/build-estimates.json` (orchestrator-authored).
Actuals join from `timing-summary.json`. Re-run
`node .claude/scripts/build-estimates.js render` anytime for an updated view._
