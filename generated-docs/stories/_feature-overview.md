# Feature Overview — Transaction Import & Approval System

Approved epic breakdown (4 epics). Strictly linear dependency chain (1 → 2 → 3 → 4).

| # | Epic | Depends on | Requirements |
|---|------|-----------|--------------|
| 1 | Authentication & Application Shell | — | R1, R2, NFR1–NFR8 |
| 2 | File Management — Dashboard, Upload & File Lifecycle | 1 | R3, R4, R5, R8, R12, R13, R14, R15, R16, R17, R18, BR4, BR5, BR7, BR10, BR11 |
| 3 | Transactions Table, Filtering & Export | 1, 2 | R6, R7, R11, R16, R17, R18, BR6, BR9, BR11 |
| 4 | Transaction Review — Approve & Reject | 1, 2, 3 | R9, R10, BR1, BR2, BR3, BR8, BR9 |

## Epic 1 — Authentication & Application Shell
BFF session-cookie login with credential-vs-connectivity error states, role-based landing routing (Importer → Dashboard, Approver → Transactions), and the app-wide shell (nav, role-gated visibility, session lifecycle, privacy-policy link) carrying the cross-cutting accessibility, responsive, error-UX, and session NFRs.

## Epic 2 — File Management — Dashboard, Upload & File Lifecycle
The File Logs dashboard (paginated, sortable, filterable table with status badges and drill-through), Importer file upload (drag-and-drop / picker, progress, success/failure), and per-file detail with the status-count summary, validation-error view, retry-validation, and cancel-file lifecycle actions — all role-gated to Importer where required.

## Epic 3 — Transactions Table, Filtering & Export
The top-level Transactions table (paginated, sortable, all specified columns) with the full filter set (status, file, date range, amount range, free-text on reference/account), active filter chips with clear-all, distinct empty/no-results states, read-only mode for Importers, and Approver CSV export of exactly the filtered set.

## Epic 4 — Transaction Review — Approve & Reject
Approver-only approve and reject actions on Imported transactions — confirmation modal naming the reference (destructive styling, default focus on Cancel), mandatory rejection note with on-blur/on-submit validation, immediate status transition with toast, terminal-state action hiding with a top-of-page banner, and read-only display of rejection notes on rejected records.

## Cross-cutting / notes
- NFR1–NFR6, NFR8 are cross-cutting build constraints anchored on Epic 1 and re-applied per epic during BUILD. NFR7 (availability/RTO/RPO) is an operational target with no frontend surface — no stories.
- Shared table requirements (R16, R17, R18, BR11) recur in Epics 2 and 3 (each table instantiates pagination/sort/filter-chips/empty-states). BR9 spans Epic 3 (Importer read-only rendering) and Epic 4 (Approver action gating).
- Data-divergence caveats from brief §13 (TransactionType `C`/`D` vs `"Debit"`, `CurrentFileName` vs `FileName`, `CurrentStatus` vs `LastExecutedActivityName`, placeholder `"Viewer"` role) resolved at the data layer in Epics 2/3.
- Transactions API at :10005 not serving routes — Epics 2/3/4 use page-route Playwright mocks (NFR8) until reachable.
