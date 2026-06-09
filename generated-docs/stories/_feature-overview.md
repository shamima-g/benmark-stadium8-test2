# Feature Overview — Transaction Import & Approval System

Approved epic breakdown (6 epics). Dependency-ordered.

| # | Epic | Depends on | Requirements |
|---|------|-----------|--------------|
| 1 | Authentication & Application Shell | — | R1, R2, NFR1, NFR3, NFR4, NFR5, NFR6, NFR8 |
| 2 | File Logs Dashboard | 1 | R5, R8, R16, R17, R18, BR11 |
| 3 | Transactions Table, Filtering & Export | 1 | R6, R7, R11, R16, R17, R18, BR6, BR9, BR11 |
| 4 | Transaction Review (Approve & Reject) | 3 | R9, R10, BR1, BR2, BR3, BR8, BR9 |
| 5 | File Upload | 2 | R3, R4, BR10 |
| 6 | File Detail, Summary & Lifecycle | 2, 5 | R12, R13, R14, R15, BR4, BR5, BR7, BR10 |

## Epic 1 — Authentication & Application Shell
BFF session-cookie sign-in, role-aware landing routing (Importer → Dashboard, Approver → Transactions), the authenticated app shell/navigation, and session lifecycle (idle warning, timeout, lockout).

## Epic 2 — File Logs Dashboard
The File Logs landing table (File Name, Process Date, Record Count, File Status) with pagination, single-column sort, filtering (status, file name, process-date range), active filter chips with Clear-all, and zero-data vs zero-results empty states. Rows drill through to a file's transactions.

## Epic 3 — Transactions Table, Filtering & Export
The Transactions table with all specified columns, status badges, pagination, single-column sort, the full filter set (status, file, date range, amount range, free-text search), active filter chips with Clear-all, empty states, and CSV export of exactly the filtered set (Approver-only, disabled when zero rows match).

## Epic 4 — Transaction Review (Approve & Reject)
Approver-only Approve and Reject row actions on Imported transactions, each behind a confirmation modal naming the reference; mandatory Rejection Note with on-blur/on-submit validation; immediate status flip with toast; terminal-state banners and hidden actions on non-Imported rows; read-only Rejection Note display; audit capture of acting user and timestamp.

## Epic 5 — File Upload
Importer-only transaction-file upload via drag-and-drop or file picker, capturing the file setting and file name; upload progress and explicit success/failure feedback; creation of a File Log entry that surfaces on the Dashboard.

## Epic 6 — File Detail, Summary & Lifecycle
The per-file detail view with a Summary panel (Total/Imported/Approved/Rejected counts that link to filtered transaction slices), validation-errors view and Importer-only Retry on Failed files, Importer-only Cancel File (blocked when any transaction is Approved), and not-yet-final banners for Processing/Uploaded files.

## Cross-cutting / not standalone epics
- NFR1 (a11y), NFR2 (perf), NFR3 (responsive), NFR4 (browsers), NFR5 (error UX), NFR8 (Playwright-mock layer) — build constraints applied across all UI epics; anchored on Epic 1.
- NFR7 (availability/RTO/RPO) — operational target with no frontend surface; no stories.
