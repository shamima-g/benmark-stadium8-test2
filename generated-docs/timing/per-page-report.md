# Per-Page Build Report

_Generated: 2026-06-11 06:39Z_

One row per **page (wireframe)** — a routable story — joining its planning
**estimate**, measured **active build time**, estimate-vs-actual **variance**,
and **tokens / cost**. Infrastructure-only stories (no page) are listed separately.
Cx = complexity (S/M/L). Cost is an estimate from public model rates — a guide, not a bill.

## Pages (wireframes)

| E.S | Page | Route | Cx | Estimate | Actual | Variance | Tokens | Est. cost |
| --- | --- | --- | :---: | --- | --- | --- | --- | --- |
| 1.1 | BFF session proxy and auth foundation | ? | L | 45m | — | — | — | — |
| 1.2 | Login screen with credential and connectivity error states | ? | M | 30m | — | — | 12,459,859 | $12.79 |
| 1.3 | Role-based landing routing and route protection | ? | M | 35m | — | — | — | — |
| 1.4 | Application shell with role-gated navigation and sign-out | ? | M | 35m | — | — | — | — |
| 1.5 | Session lifecycle — idle warning and timeout handling | ? | M | 30m | — | — | — | — |
| 2.1 | File Logs Dashboard | ? | L | 55m | — | — | — | — |
| 2.2 | Upload a Transaction File | ? | M | 40m | — | — | — | — |
| 2.3 | File Detail — Summary & Status-Count Drill-Through | ? | M | 40m | — | — | — | — |
| 2.4 | File Lifecycle — Validation Errors, Retry & Cancel (Importer) | ? | L | 50m | — | — | — | — |
| 3.1 | Transactions table — columns, sorting, pagination and read-only view | ? | L | 50m | — | — | — | — |
| 3.2 | Filter and search the transactions, with active filter chips and deep-link in | ? | L | 55m | — | — | — | — |
| 3.3 | Approver export of the filtered transactions as CSV | ? | M | 35m | — | — | — | — |
| 4.1 | Approving an imported transaction | ? | M | 40m | — | — | — | — |
| 4.2 | Rejecting a transaction with a note | ? | M | 40m | — | — | — | — |
| 4.3 | Hiding actions once a transaction is decided | ? | S | 25m | — | — | — | — |
| 4.4 | Reading why a transaction was rejected | ? | S | 25m | — | — | — | — |
| **Total** | **16 page(s)** | | | **10h 30m** | **—** | — | **12,459,859** | **$12.79** |

## Grand total (all stories)

| | Estimate | Actual | Variance | Tokens | Est. cost |
| --- | --- | --- | --- | --- | --- |
| **All 16 stories** | **10h 30m** | **—** | — | **12,459,859** | **$12.79** |

---

_Sources: `build-estimates.json` (estimates), `timing-summary.json` (actual time),
`token-summary.json` (tokens/cost), `workflow-state.json` (page identity).
Re-run `node .claude/scripts/per-page-report.js --refresh` anytime for an updated view._
