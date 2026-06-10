# Build Time Estimates

_Generated: 2026-06-10 05:04Z_

Predicted active build time per story, authored at the planning gate.
Actuals are filled in from `timing-summary.json` once a story is built
(run `node .claude/scripts/timing-report.js` first to refresh them).
Complexity: **S** small · **M** medium · **L** large.

> Actuals not yet available — `timing-summary.json` is written when
> `timing-report.js` runs (at COMPLETE, or any mid-build snapshot).

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

## Total

| | Estimate | Actual | Variance |
| --- | --- | --- | --- |
| **All stories** | **6h** | **—** | — |

---

_Source: `generated-docs/timing/build-estimates.json` (orchestrator-authored).
Actuals join from `timing-summary.json`. Re-run
`node .claude/scripts/build-estimates.js render` anytime for an updated view._
