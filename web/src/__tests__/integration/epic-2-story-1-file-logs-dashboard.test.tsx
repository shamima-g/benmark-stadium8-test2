/**
 * Story Metadata:
 * - Route: /dashboard
 * - Target File: web/src/app/(app)/dashboard/page.tsx
 * - Page Action: modify_existing (REPLACES the Epic-1 placeholder dashboard page)
 *
 * Epic 2, Story 1: File Logs Dashboard.
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - ALL SIX acceptance criteria (AC-1 table+badges, AC-2 sort, AC-3 pagination
 *     page-size, AC-4 filters+chips+Clear-all, AC-5 empty states + Importer-only
 *     Upload CTA, AC-6 row drill-through) are PLAYWRIGHT-tagged. They are proven
 *     end-to-end against mocked GET /v1/file-logs responses in the companion spec
 *     web/e2e/epic-2-story-1-file-logs-dashboard.spec.ts and are NOT duplicated as
 *     full-flow Vitest siblings.
 *
 * What this Vitest file DOES cover — the jsdom-observable units that UNDERPIN
 * those Playwright flows and are this story's highest-value regression surface:
 *   1. The FileLog -> table-row MAPPING (project-brief §6 / §13):
 *        CurrentFileName -> "File Name"; RecordCount (string in the spec) coerced
 *        for display/sort; CurrentStatus -> status badge { label, variant }
 *        following the §11 status colour mapping (assert LABEL + semantic VARIANT,
 *        never hex — per CLAUDE.md §2 styling-centralisation).
 *   2. The client-side FILTER predicate (R8 / §13 spec-gap: the API exposes no
 *        filter params, so Status / File Name / Process-Date-range filtering is
 *        derived client-side over the full list).
 *   3. The single-column SORT comparator (R17): asc on first click, desc on
 *        second, across the distinct column value-types (string name, datetime
 *        Process Date, numeric Record Count).
 *   4. PAGINATION slicing (R16): page sizes 5/10/20/50, default 20.
 *   5. A focused integration render of the dashboard page asserting the
 *        jsdom-observable rendering DECISIONS this story owns: the two DISTINCT
 *        empty states (zero-data "no file logs yet" vs zero-after-filter
 *        "no results") per BR11, and the Importer-ONLY Upload CTA gating off the
 *        granted-route set (§2 permission matrix; BR11 — the CTA shows in the
 *        zero-data state only, and only for an Importer).
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R5 (§7): paginated, sortable File Logs table; columns File Name, Process
 *     Date, Record Count, File Status; rows link through to the file's detail.
 *   - R8 (§7): filter by Status, File Name, Process-Date range.
 *   - R16/R17 (§7): page sizes 5/10/20/50 default 20; single-column asc-then-desc.
 *   - R18 / BR11 (§7/§8): active filter chips + Clear-all; zero-data vs
 *     zero-filter-results empty states distinguished; creation CTA only in the
 *     zero-data state.
 *   - §11: status badge mapping — Completed/Approved -> success; Failed/Rejected
 *     -> error/destructive; Processing/Imported -> info; Uploaded -> neutral.
 *     Colour is always paired with a label.
 *   - §6 / §13: CurrentFileName is the File Name source; RecordCount is a string;
 *     CurrentStatus is the badge source (not LastExecutedActivityName).
 *   - §2: Upload is Importer-only; denied actions are HIDDEN, not disabled.
 *
 * EXTRACTED HELPERS the developer must create (pure modules under
 * web/src/lib/file-logs/ — see the failing imports below). Keeping the mapping /
 * filter / sort / pagination logic as pure functions is what lets these units be
 * asserted in jsdom without recreating the full Playwright flows:
 *   - web/src/lib/file-logs/mapping.ts  -> toFileLogRow, fileStatusBadge, FileLogRow, StatusBadge
 *   - web/src/lib/file-logs/filter.ts   -> filterFileLogRows, FileLogFilters
 *   - web/src/lib/file-logs/sort.ts     -> sortFileLogRows, FileLogSortColumn, SortDirection
 *   - web/src/lib/file-logs/pagination.ts -> paginate, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE
 * Plus the FileLog / FileLogList types added to web/src/types/api.ts (PascalCase,
 * mirroring transactions-api.yaml).
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/`
 * Vite alias does not resolve the parenthesised group segment, so the page is
 * imported via a relative path (the helper modules under @/lib resolve normally).
 *
 * These tests WILL FAIL until the helpers, types, and page are implemented (TDD red).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import DashboardPage from '../../app/(app)/dashboard/page';
import { toFileLogRow, fileStatusBadge } from '@/lib/file-logs/mapping';
import { filterFileLogRows } from '@/lib/file-logs/filter';
import { sortFileLogRows } from '@/lib/file-logs/sort';
import {
  paginate,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '@/lib/file-logs/pagination';

import { get } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockFileLog,
  createMockFileLogs,
  createMockFileLogList,
} from '../helpers/epic-2-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the mappers, the filters). The dashboard fetches the full active list via
// GET /v1/file-logs?IsActive=Yes; we drive that boundary here.
vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;

// The dashboard reads the signed-in user from the session to gate the
// Importer-only Upload CTA off the granted-route set. Mock the hook so each test
// can model the persona; the real SessionProvider's network/normalisation path
// is Epic-1 baseline coverage and not re-proven here.
vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// Row drill-through navigates client-side; stub Next navigation so the page can
// render in jsdom. (The actual navigation outcome is the Playwright AC-6 concern.)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

/** A loaded session for the given role (default Importer). */
function sessionFor(roles: string[] = ['Importer']) {
  return {
    user: createMockAuthUser({ roles }),
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  };
}

describe('Epic 2, Story 1: File Logs Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue(sessionFor(['Importer']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // Unit: FileLog -> row mapping + status badge (underpins AC-1)
  // ===================================================================

  // R5 / §6 / §13 — CurrentFileName maps to File Name; RecordCount (a string in
  // the spec) is coerced to a number for sort/display; ProcessDate is carried.
  it('maps a FileLog onto a table row using CurrentFileName and a numeric record count', () => {
    const row = toFileLogRow(
      createMockFileLog({
        Id: 4242,
        CurrentFileName: 'statements-q2.csv',
        RecordCount: '1240',
        ProcessDate: '2026-06-01T09:15:00Z',
        CurrentStatus: 'Completed',
      }),
    );

    expect(row.id).toBe(4242);
    expect(row.fileName).toBe('statements-q2.csv');
    // RecordCount is a string in the API; the row must expose a number so the
    // sort comparator orders numerically (47 < 760 < 3000), not lexically.
    expect(row.recordCount).toBe(1240);
    expect(typeof row.recordCount).toBe('number');
    expect(row.processDate).toBe('2026-06-01T09:15:00Z');
    expect(row.status).toBe('Completed');
  });

  // §11 — status badge mapping. Assert the user-observable LABEL and the semantic
  // VARIANT, never a hex value (CLAUDE.md §2 / styling-centralisation: colours
  // reference tokens, so the contract is the variant name, not the colour).
  // Distinct value-types per status family -> a small it.each table (<=5 rows is
  // the policy ceiling; the success/error/info/neutral families are the distinct cases).
  it.each([
    ['Completed', 'success'],
    ['Failed', 'error'],
    ['Processing', 'info'],
    ['Uploaded', 'neutral'],
  ])(
    'maps status %s to a labelled badge with the %s variant',
    (status, variant) => {
      const badge = fileStatusBadge(status);
      expect(badge.variant).toBe(variant);
      // The label is the user-visible status text — colour is never used alone.
      expect(badge.label.toLowerCase()).toContain(status.toLowerCase());
    },
  );

  // ===================================================================
  // Unit: client-side filter predicate (underpins AC-4; R8 spec-gap)
  // ===================================================================

  // R8 / §13 — the API exposes no filter params, so Status / File Name /
  // Process-Date-range filtering is derived client-side over the full list.
  it('filters rows by status, file-name substring, and process-date range', () => {
    const rows = createMockFileLogs().map(toFileLogRow);

    // Status filter: only Failed rows survive.
    const failed = filterFileLogRows(rows, { status: 'Failed' });
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.status === 'Failed')).toBe(true);

    // File-name filter is a case-insensitive substring match.
    const named = filterFileLogRows(rows, { fileName: 'ALPHA' });
    expect(named).toHaveLength(1);
    expect(named[0].fileName).toBe('alpha-2026-06-01.csv');

    // Process-date range is inclusive of both bounds (June 2–4 -> bravo, charlie,
    // delta from the fixture).
    const inRange = filterFileLogRows(rows, {
      processDateFrom: '2026-06-02',
      processDateTo: '2026-06-04',
    });
    expect(inRange.map((r) => r.fileName).sort()).toEqual([
      'bravo-2026-06-02.csv',
      'charlie-2026-06-03.csv',
      'delta-2026-06-04.csv',
    ]);
  });

  // R8 — an empty filter set is a no-op (returns the full list); distinct
  // criteria compose with AND.
  it('returns the full list for an empty filter and ANDs multiple criteria', () => {
    const rows = createMockFileLogs().map(toFileLogRow);

    expect(filterFileLogRows(rows, {})).toHaveLength(rows.length);

    // Completed AND name contains "echo" -> exactly the echo row.
    const combined = filterFileLogRows(rows, {
      status: 'Completed',
      fileName: 'echo',
    });
    expect(combined).toHaveLength(1);
    expect(combined[0].fileName).toBe('echo-2026-06-05.csv');
  });

  // ===================================================================
  // Unit: single-column sort comparator (underpins AC-2; R17)
  // ===================================================================

  // R17 — sort ascending then descending on the SAME column. Assert across the
  // three distinct column value-types so the comparator is proven to order a
  // string (fileName), a datetime (processDate), and a number (recordCount)
  // correctly — not by stringified value.
  it('sorts ascending then descending across string, date, and numeric columns', () => {
    const rows = createMockFileLogs().map(toFileLogRow);

    // String column (File Name): alpha first ascending, hotel first descending.
    const nameAsc = sortFileLogRows(rows, 'fileName', 'asc');
    const nameDesc = sortFileLogRows(rows, 'fileName', 'desc');
    expect(nameAsc[0].fileName).toBe('alpha-2026-06-01.csv');
    expect(nameDesc[0].fileName).toBe('hotel-2026-06-08.csv');

    // Numeric column (Record Count): must order numerically (9 < 47 < ... < 3000),
    // NOT lexically (where "3000" < "47"). Smallest first ascending.
    const countAsc = sortFileLogRows(rows, 'recordCount', 'asc');
    const countDesc = sortFileLogRows(rows, 'recordCount', 'desc');
    expect(countAsc[0].recordCount).toBe(9);
    expect(countDesc[0].recordCount).toBe(3000);

    // Date column (Process Date): chronological — earliest first ascending.
    const dateAsc = sortFileLogRows(rows, 'processDate', 'asc');
    const dateDesc = sortFileLogRows(rows, 'processDate', 'desc');
    expect(dateAsc[0].fileName).toBe('alpha-2026-06-01.csv');
    expect(dateDesc[0].fileName).toBe('hotel-2026-06-08.csv');

    // The comparator is pure — it does not mutate the input order.
    expect(rows[0].fileName).toBe('alpha-2026-06-01.csv');
  });

  // ===================================================================
  // Unit: pagination slicing (underpins AC-3; R16)
  // ===================================================================

  // R16 — page-size options are exactly 5/10/20/50 with a default of 20; slicing
  // returns the correct window for a given page.
  it('exposes the 5/10/20/50 page sizes (default 20) and slices to the requested page', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([5, 10, 20, 50]);
    expect(DEFAULT_PAGE_SIZE).toBe(20);

    const rows = createMockFileLogs().map(toFileLogRow); // 8 rows

    // Page size 5 -> page 1 holds the first 5, page 2 holds the remaining 3.
    const page1 = paginate(rows, 1, 5);
    const page2 = paginate(rows, 2, 5);
    expect(page1).toHaveLength(5);
    expect(page2).toHaveLength(3);
    // The two pages are disjoint and cover the list in order.
    expect(page1[0].id).toBe(rows[0].id);
    expect(page2[0].id).toBe(rows[5].id);

    // A page size that exceeds the row count returns all rows on page 1.
    expect(paginate(rows, 1, 20)).toHaveLength(rows.length);
  });

  // ===================================================================
  // Integration render: empty states + Importer-only CTA (underpins AC-5/BR11)
  // ===================================================================

  // BR11 — zero-DATA state: when the API returns no file logs at all, the
  // "no file logs yet" empty state shows the Upload creation CTA (Importer).
  it('shows the zero-data empty state with an Upload CTA when no file logs exist', async () => {
    mockGet.mockResolvedValue(createMockFileLogList([]));
    mockUseSession.mockReturnValue(sessionFor(['Importer']));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/no file logs yet/i)).toBeInTheDocument();
    });
    // The creation CTA is present in the zero-DATA state for an Importer.
    expect(screen.getByRole('link', { name: /upload/i })).toBeInTheDocument();
  });

  // BR11 — the zero-data CTA is Importer-ONLY. An Approver sees the empty state
  // WITHOUT the Upload CTA (denied actions are hidden, not disabled — §2).
  it('hides the Upload CTA in the zero-data state for an Approver', async () => {
    mockGet.mockResolvedValue(createMockFileLogList([]));
    mockUseSession.mockReturnValue(sessionFor(['Approver']));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/no file logs yet/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('link', { name: /upload/i }),
    ).not.toBeInTheDocument();
  });

  // BR11 — zero-FILTER-RESULTS state is DISTINCT from zero-data: data exists but
  // an active filter matches nothing. The no-results state must NOT offer the
  // creation CTA, and Clear-all stays visible. We drive a File-Name filter that
  // matches none of the fixture rows.
  it('shows a distinct zero-filter-results state (no creation CTA) when a filter matches nothing', async () => {
    mockGet.mockResolvedValue(createMockFileLogList());
    mockUseSession.mockReturnValue(sessionFor(['Importer']));
    const user = userEvent.setup();

    render(<DashboardPage />);

    // Wait for the populated table first so we know data loaded.
    await waitFor(() => {
      expect(screen.getByText('alpha-2026-06-01.csv')).toBeInTheDocument();
    });

    // Apply a File-Name filter that matches none of the fixture rows.
    const nameFilter = screen.getByRole('textbox', { name: /file name/i });
    await user.type(nameFilter, 'no-such-file-zzz');

    await waitFor(() => {
      expect(screen.getByText(/no.*results|no matching/i)).toBeInTheDocument();
    });
    // Distinct from zero-data: the "no file logs yet" creation prompt is absent.
    expect(screen.queryByText(/no file logs yet/i)).not.toBeInTheDocument();
    // Clear-all stays available so the user can recover the full list.
    expect(
      screen.getByRole('button', { name: /clear all/i }),
    ).toBeInTheDocument();
  });

  // NFR1 — the loaded dashboard has no accessibility violations.
  it('has no accessibility violations once the file logs have loaded', async () => {
    mockGet.mockResolvedValue(createMockFileLogList());
    mockUseSession.mockReturnValue(sessionFor(['Importer']));

    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('alpha-2026-06-01.csv')).toBeInTheDocument();
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
