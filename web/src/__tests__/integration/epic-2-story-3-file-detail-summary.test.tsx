/**
 * Story Metadata:
 * - Route: /files/[id]
 * - Target File: web/src/app/(app)/files/[id]/page.tsx
 * - Page Action: create_new (REPLACES the thin Epic-2-Story-1 placeholder shell
 *   at this path — the placeholder existed only so the dashboard row drill-through
 *   resolved; this story builds the real read-only file-detail summary).
 *
 * Epic 2, Story 3: File Detail — Summary & Status-Count Drill-Through.
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (file header name + status badge + Total/Imported/Approved/Rejected
 *     summary panel), AC-2 (count -> filtered-transactions navigation), and AC-3
 *     (Processing/Uploaded work-in-progress banner — BR4) are PLAYWRIGHT-tagged
 *     and proven end-to-end against mocked responses in the companion spec
 *     web/e2e/epic-2-story-3-file-detail-summary.spec.ts. They are NOT duplicated
 *     as full-flow Vitest siblings.
 *   - AC-4 (a loading state and an error/not-found state for an unavailable or
 *     unknown file) is VITEST-tagged and proven here as a focused page render.
 *
 * What this Vitest file DOES cover:
 *   1. AC-4 — the page's loading state and its error/not-found state for an
 *      unknown / unavailable file (two distinct jsdom-observable renders).
 *   2. The jsdom-observable UNITS that underpin the Playwright AC-1/AC-2/AC-3
 *      flows and are this story's highest-value regression surface:
 *        - computeStatusCounts(transactions, fileLogId): the client-side status
 *          tally (Total / Imported / Approved / Rejected) derived from the full
 *          transactions list filtered by FileLogId. GET /v1/transactions exposes
 *          no FileLogId / Status params (the documented Epic 2 spec-gap), so this
 *          filtering + tally happens client-side. (Underpins AC-1.)
 *        - buildTransactionsHref(fileLogId, status): the drill-through link-target
 *          builder for the count -> filtered-transactions navigation, producing
 *          the agreed /transactions?fileLogId=<id>&status=<status> query params.
 *          (Underpins AC-2.)
 *        - isFileWorkInProgress(status): the BR4 predicate — true for Processing
 *          and Uploaded files (whose dataset is not yet final), false for terminal
 *          statuses. (Underpins AC-3.)
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R12 (§7): per-File Summary view showing Total / Imported / Approved /
 *     Rejected; clicking a count navigates to that filtered slice of Transactions.
 *   - BR4 (§8): when a File Log's status is Processing or Uploaded, the drill-down
 *     indicates work-in-progress and a "dataset not yet final" banner is shown.
 *   - §6 / §13: TransactionRead.FileLogId is the owning file's Id; Status is the
 *     per-transaction enum ('Imported' | 'Approved' | 'Rejected'). FileLog.
 *     CurrentStatus is the file's status (the badge source).
 *   - NFR5 (§10): API errors are never silently swallowed; an unavailable/unknown
 *     file surfaces a user-visible error/not-found state, not a blank page.
 *   - Epic 2 spec-gap (epic overview): GET /v1/transactions has no FileLogId /
 *     Status query params -> client-side filter + tally over the full list.
 *
 * EXTRACTED HELPERS the developer must create (pure module — see the failing
 * import below). Keeping the count / href / work-in-progress logic as pure
 * functions is what lets these units be asserted in jsdom without recreating the
 * full Playwright flows:
 *   - web/src/lib/files/statusCounts.ts ->
 *       computeStatusCounts(transactions, fileLogId): StatusCounts
 *       buildTransactionsHref(fileLogId, status): string
 *       isFileWorkInProgress(status): boolean
 *       (and the StatusCounts shape: { total, imported, approved, rejected })
 *
 * REUSED from Story 1 (no duplication): FileStatusBadge + fileStatusBadge status
 * mapping (@/components/file-logs/FileStatusBadge, @/lib/file-logs/mapping); the
 * FileLog / FileLogList types and the new TransactionRead / TransactionReadList
 * types in @/types/api; the shared mock factories in epic-2-mock-data.
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/`
 * Vite alias does not resolve the parenthesised group segment, so the page is
 * imported via a relative path (the helper module under @/lib resolves normally).
 *
 * These tests WILL FAIL until the helper module and the real page are implemented
 * (TDD red).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import/behave until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import FileDetailPage from '../../app/(app)/files/[id]/page';
import {
  computeStatusCounts,
  buildTransactionsHref,
  isFileWorkInProgress,
} from '@/lib/files/statusCounts';

import { get } from '@/lib/api/client';
import {
  createMockFileLog,
  createMockFileLogList,
  createMockTransaction,
  createMockTransactions,
  createMockTransactionList,
} from '../helpers/epic-2-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the helpers). The file-detail page fetches the active File Logs list (to locate
// the FileLog by route id — there is no single-file endpoint) and the full
// transactions list (filtered by FileLogId client-side). We drive that boundary.
vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;

// The detail page lives inside the protected (app) shell; mock the session hook
// so the page can render in jsdom. The real SessionProvider network/normalisation
// path is Epic-1 baseline coverage and is not re-proven here. Both roles can view
// the detail summary, so no role gating is asserted in this file.
vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: () => ({
    user: {
      email: 'importer@example.com',
      name: 'Ingrid Mporter',
      roles: ['Importer'],
      routes: ['/dashboard', '/upload', '/files'],
    },
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Count drill-through navigates client-side; stub Next navigation so the page can
// render in jsdom. (The actual navigation outcome is the Playwright AC-2 concern.)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/files/1001',
  useSearchParams: () => new URLSearchParams(),
}));

/** Renders the page for a given route id (read via use(params) in the page). */
function renderDetail(id: string) {
  return render(<FileDetailPage params={Promise.resolve({ id })} />);
}

describe('Epic 2, Story 3: File Detail — Summary & Status-Count Drill-Through', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // Unit: computeStatusCounts — client-side tally over the FileLogId-
  // filtered transactions list (underpins AC-1 / R12).
  // ===================================================================

  // R12 / §6 / Epic 2 spec-gap — counts only the transactions belonging to the
  // given FileLogId; Total = the filtered count, with per-status sub-tallies.
  it('tallies Total/Imported/Approved/Rejected for only the matching FileLogId', () => {
    // Fixture: FileLog 1001 has 2 Imported, 1 Approved, 1 Rejected; FileLog 2002
    // has 2 unrelated transactions that must be excluded by the client-side filter.
    const counts = computeStatusCounts(createMockTransactions(), 1001);

    expect(counts).toEqual({
      total: 4,
      imported: 2,
      approved: 1,
      rejected: 1,
    });
  });

  // §6 — FileLogId is the only ownership key; transactions for other files are
  // excluded entirely (the endpoint cannot filter server-side).
  it('excludes transactions that belong to a different FileLogId', () => {
    const counts = computeStatusCounts(createMockTransactions(), 2002);

    // FileLog 2002 owns exactly 1 Approved + 1 Rejected and zero Imported.
    expect(counts).toEqual({
      total: 2,
      imported: 0,
      approved: 1,
      rejected: 1,
    });
  });

  // R12 — a file with no transactions yields an all-zero summary (no crash, no
  // NaN), so the page can render a meaningful "0" summary rather than blanks.
  it('returns an all-zero summary when no transactions match the file', () => {
    const counts = computeStatusCounts(createMockTransactions(), 9999);

    expect(counts).toEqual({
      total: 0,
      imported: 0,
      approved: 0,
      rejected: 0,
    });
  });

  // ===================================================================
  // Unit: buildTransactionsHref — drill-through link target (underpins AC-2 / R12).
  // ===================================================================

  // R12 — clicking a status count must navigate to that file's transactions
  // pre-filtered by FileLogId + Status, using the agreed query params.
  it('builds a transactions href pre-filtered by FileLogId and Status', () => {
    expect(buildTransactionsHref(1001, 'Approved')).toBe(
      '/transactions?fileLogId=1001&status=Approved',
    );
    expect(buildTransactionsHref(1001, 'Rejected')).toBe(
      '/transactions?fileLogId=1001&status=Rejected',
    );
  });

  // ===================================================================
  // Unit: isFileWorkInProgress — BR4 predicate (underpins AC-3).
  // ===================================================================

  // BR4 — Processing and Uploaded files are not yet final (work-in-progress);
  // terminal/complete statuses are not. Keyed case-insensitively so a backend
  // casing drift never silently flips the banner off.
  it('flags Processing and Uploaded files as work-in-progress and others as final', () => {
    expect(isFileWorkInProgress('Processing')).toBe(true);
    expect(isFileWorkInProgress('Uploaded')).toBe(true);
    expect(isFileWorkInProgress('uploaded')).toBe(true);

    expect(isFileWorkInProgress('Completed')).toBe(false);
    expect(isFileWorkInProgress('Failed')).toBe(false);
  });

  // ===================================================================
  // AC-4: page loading state + error/not-found state for an unavailable
  // or unknown file (the only Vitest-tagged acceptance criterion).
  // ===================================================================

  // AC-4 — while the FileLog / transactions fetches are in flight, the page shows
  // a loading state (no premature summary, no error). Mock never resolves so the
  // pending render is observable.
  it('shows a loading state while the file and its transactions are being fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {}));

    renderDetail('1001');

    expect(screen.getByRole('status')).toBeInTheDocument();
    // The summary counts must not render before data arrives.
    expect(screen.queryByText(/imported/i)).not.toBeInTheDocument();
  });

  // AC-4 / NFR5 — an unknown file id (no matching FileLog in the active list)
  // surfaces a user-visible error / not-found state, not a blank page or a crash.
  it('shows an error/not-found state when the requested file id is unknown', async () => {
    // The active file-logs list resolves but contains no FileLog with id 4242;
    // the transactions list resolves normally. The page must treat the missing
    // file as not-found.
    mockGet.mockImplementation((endpoint: string) => {
      if (endpoint.includes('/v1/file-logs')) {
        return Promise.resolve(createMockFileLogList());
      }
      return Promise.resolve(createMockTransactionList());
    });

    renderDetail('4242');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // No summary panel for a file that does not exist.
    expect(screen.queryByText(/approved/i)).not.toBeInTheDocument();
  });

  // AC-4 / NFR5 — a failed fetch (the transactions backend is currently 404-ing,
  // per NFR8) surfaces the same user-visible error state with a retry affordance,
  // never a silently swallowed failure.
  it('shows an error state when the file/transactions fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    renderDetail('1001');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // ===================================================================
  // Accessibility — the loaded detail summary has no axe violations.
  // ===================================================================

  // NFR1 — the loaded file-detail summary (header + status badge + counts) is
  // accessible. Drives a successful render of FileLog 1001 with its transactions.
  it('has no accessibility violations once the file detail has loaded', async () => {
    mockGet.mockImplementation((endpoint: string) => {
      if (endpoint.includes('/v1/file-logs')) {
        return Promise.resolve(
          createMockFileLogList([
            createMockFileLog({ Id: 1001, CurrentStatus: 'Completed' }),
          ]),
        );
      }
      return Promise.resolve(
        createMockTransactionList([
          createMockTransaction({
            Id: 5001,
            FileLogId: 1001,
            Status: 'Imported',
          }),
          createMockTransaction({
            Id: 5002,
            FileLogId: 1001,
            Status: 'Approved',
          }),
        ]),
      );
    });

    const { container } = renderDetail('1001');

    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
