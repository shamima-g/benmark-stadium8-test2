# Epic 2 — File Management — Dashboard, Upload & File Lifecycle

**Slug:** epic-2-file-management
**Depends on:** Epic 1 (Authentication & Application Shell)
**Requirements:** R3, R4, R5, R8, R12, R13, R14, R15, R16, R17, R18, BR4, BR5, BR7, BR10, BR11
**epicIntroducesSharedSurface:** false

**Summary:** The File Logs dashboard (paginated, sortable, filterable table with status badges and drill-through), Importer file upload (drag-and-drop / picker, progress, success/failure), and per-file detail with the status-count summary, validation-error view, retry-validation, and cancel-file lifecycle actions — all role-gated to Importer where required.

## Stories

| # | Title | Route | Target file | Action | Reqs | Coverage |
|---|---|---|---|---|---|---|
| 1 | File Logs Dashboard | `/dashboard` | `web/src/app/(app)/dashboard/page.tsx` | modify_existing | R5, R8, R16, R17, R18, BR11 | AC-1..5 playwright, drill-through playwright |
| 2 | Upload a Transaction File | `/upload` | `web/src/app/(app)/upload/page.tsx` | create_new | R3, R4, BR10 | AC-1..4 playwright |
| 3 | File Detail — Summary & Status-Count Drill-Through | `/files/[id]` | `web/src/app/(app)/files/[id]/page.tsx` | create_new | R12, BR4 | AC-1..3 playwright, AC-4 vitest |
| 4 | File Lifecycle — Validation Errors, Retry & Cancel (Importer) | `/files/[id]` | `web/src/app/(app)/files/[id]/page.tsx` | modify_existing | R13, R14, R15, BR5, BR7, BR10 | AC-1..4 playwright |

Stories 3 and 4 share the `/files/[id]` route: Story 3 builds the read-only summary shell (both roles); Story 4 layers the Importer-only mutating lifecycle controls (retry / cancel / validation errors) onto it.

## Non-goals

- No FileSetting creation, editing, or deletion — Importers pick from existing settings only
- No bulk file upload — one file at a time
- No virus scanning or content inspection of uploaded files beyond the backend's own validation
- No file-history or re-download of previously uploaded source files

## Spec gaps (shared root cause)

`GET /v1/file-logs` and `GET /v1/transactions` expose almost no filter/lookup query params, so Dashboard filtering (R8, story 1), per-file status counts and the count→transactions drill-through (story 3), and the BR7 "any Approved transaction?" check that blocks Cancel (story 4) all fall back to **client-side derivation over full-list fetches**. Story 2's upload success response does not return the created FileLog id. Combined with **NFR8** (the transactions backend at localhost:10005 is not serving these paths yet), the Playwright specs use mocked responses shaped from `documentation/transactions-api.yaml`. Approved at the Gate 2b plan review (2026-06-10) to proceed with client-side derivation against mocks.
