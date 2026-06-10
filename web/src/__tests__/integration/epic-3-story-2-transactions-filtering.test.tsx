/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing — adds filtering ONTO the Story-1 transactions
 *   table (the table, sort, and pagination are NOT rebuilt; this story layers a
 *   filter bar, active-filter chips, a Clear-all action, a zero-filter-results
 *   state, and a deep-link-in onto the existing page).
 *
 * Epic 3, Story 2: Filter & search the Transactions table (R7 / R18 / BR11).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (filter narrows the table), AC-2 (active chips + Clear-all), AC-3
 *     (zero-filter-results distinct from no-data), and AC-4 (the
 *     ?fileLogId=&status= deep-link pre-applies filters) are PLAYWRIGHT-tagged:
 *     they are proven end-to-end against mocked GET /v1/transactions in the
 *     companion spec web/e2e/epic-3-story-2-transactions-filtering.spec.ts and
 *     are NOT duplicated as full-flow Vitest siblings.
 *   - AC-5 (vitest): the filter predicate composes ALL criteria with AND — status
 *     (exact), fileLogId (exact by id), inclusive YYYY-MM-DD date bounds,
 *     inclusive numeric amount bounds, and case-insensitive substring on Reference
 *     OR AccountNumber. Empty/absent criteria are no-ops. Covered by the
 *     filterTransactionRows unit blocks below.
 *   - AC-6 (vitest): parsing the ?fileLogId=&status= query params into initial
 *     filter state handles present, absent, and malformed values without crashing.
 *     Covered by the parseTransactionFilterParams unit blocks below.
 *
 * What this Vitest file ALSO covers — the jsdom-observable filter UI behaviour
 * that UNDERPINS the Playwright AC-1..AC-3 flows and is this story's
 * highest-value regression surface:
 *   - applying a filter narrows the RENDERED rows (the page wires the predicate);
 *   - each active filter renders as a chip and Clear-all restores the full list;
 *   - the zero-filter-results state shows distinct copy from the zero-DATA state,
 *     with the chips + Clear-all still visible (BR11).
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R7 (§7): filter by Status / File (FileLogId) / Date range / Amount range /
 *     free-text on Reference + Account Number.
 *   - R18 (§7): active filter chips per applied filter with a Clear-all action;
 *     zero-results shows a no-results state with chips + Clear-all visible.
 *   - BR11 (§8): zero-FILTER-results (active chips, Clear-all, no creation CTA) is
 *     distinct from zero-DATA ("No transactions yet").
 *   - The deep-link-in param names MUST match buildTransactionsHref in
 *     web/src/lib/files/statusCounts.ts, which emits
 *     /transactions?fileLogId=<id>&status=<Status> (Epic-2 file-detail
 *     status-count drill-through).
 *
 * EXTRACTED HELPERS the developer must create (the failing imports below):
 *
 *   - web/src/lib/transactions/filter.ts
 *       -> interface TransactionFilters { status?, fileLogId?, dateFrom?, dateTo?,
 *          amountMin?, amountMax?, search? }  (mirror @/lib/file-logs/filter
 *          conventions: blank/undefined criteria are no-ops, AND composition,
 *          non-mutating).
 *       -> filterTransactionRows(rows: TransactionRow[], filters): TransactionRow[]
 *          composing AND over: status (exact, case-insensitive), fileLogId (exact
 *          by id), transactionDate inclusive YYYY-MM-DD bounds, amount inclusive
 *          numeric min/max, free-text case-insensitive substring on Reference OR
 *          AccountNumber.
 *          NOTE: TransactionRow (from @/lib/transactions/mapping) must therefore
 *          carry fileLogId (the Story-1 row shape does not yet expose it — the
 *          developer adds it; see briefDriftNotes in the test-generator return).
 *
 *   - web/src/lib/transactions/deepLink.ts
 *       -> parseTransactionFilterParams(searchParams: URLSearchParams):
 *          TransactionFilters — reads ?fileLogId=&status=, present/absent/
 *          malformed-safe (a non-numeric fileLogId is dropped, not coerced to NaN;
 *          a known status is canonicalised, an out-of-vocabulary status is passed
 *          through verbatim so it yields a genuine zero-results filter rather than
 *          silently widening the table; absent params yield an empty filter set).
 *          The param names MUST match buildTransactionsHref (`fileLogId`, `status`).
 *       -> activeFilterChips(filters: TransactionFilters): { key, label }[] — the
 *          chip descriptors the page renders (one chip per active criterion).
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/`
 * Vite alias does not resolve the parenthesised group segment, so the page is
 * imported via a relative path (helper modules under @/lib resolve normally).
 *
 * These tests WILL FAIL until the helpers and page changes are implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import TransactionsPage from '../../app/(app)/transactions/page';
import { toTransactionRow } from '@/lib/transactions/mapping';
import {
  filterTransactionRows,
  type TransactionFilters,
} from '@/lib/transactions/filter';
import {
  parseTransactionFilterParams,
  activeFilterChips,
} from '@/lib/transactions/deepLink';

import { get } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import { createMockFilterableTransactionsList } from '../helpers/epic-3-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the filter predicate, the deep-link parser). The page fetches the full list via
// GET /v1/transactions (no server-side params — the approved spec gap) and filters
// client-side; we drive that one boundary here.
vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;

vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// The deep-link-in reads the URL query params. Each render-test that exercises a
// deep link overrides this mock's return; the default is an empty query string.
const searchParamsRef = { current: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/transactions',
  useSearchParams: () => searchParamsRef.current,
}));

/** A loaded session for the given role (default Approver — the primary persona). */
function sessionFor(roles: string[] = ['Approver']) {
  return {
    user: createMockAuthUser({ roles }),
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  };
}

/** The filter-coverage rows mapped to the table-row shape the predicate operates on. */
function filterableRows() {
  return createMockFilterableTransactionsList().Transactions.map(
    toTransactionRow,
  );
}

describe('Epic 3, Story 2: Transactions filtering & search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // AC-5 — filterTransactionRows composes the R7 criteria with AND
  // ===================================================================

  // R7 — an empty filter set is a no-op (the full list passes through), and the
  // predicate is pure (a new array is returned; the input order is preserved).
  it('returns the full list unchanged when no criteria are set (no-op) and does not mutate the input', () => {
    const rows = filterableRows();
    const result = filterTransactionRows(rows, {});

    expect(result).toHaveLength(rows.length);
    expect(result.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    // Pure — a new array, input order intact.
    expect(result).not.toBe(rows);
    expect(rows[0].reference).toBe('TXN-10001');
  });

  // R7 — Status is an EXACT match (case-insensitive). The spread has 2 Imported,
  // 2 Approved, 2 Rejected... — assert only the Imported rows (the 2 in file 1001
  // plus the 1 in file 2002 = 3) survive a Status:Imported filter, and that the
  // match is case-insensitive (so a backend casing drift never drops a row).
  it('filters by Status with an exact, case-insensitive match', () => {
    const rows = filterableRows();

    const imported = filterTransactionRows(rows, { status: 'Imported' });
    expect(imported.map((r) => r.id).sort()).toEqual([5101, 5102, 6101]);

    // Case-insensitive: lower-cased input resolves the same rows.
    const importedLower = filterTransactionRows(rows, { status: 'imported' });
    expect(importedLower.map((r) => r.id).sort()).toEqual([5101, 5102, 6101]);

    // A status nothing matches yields an empty set (not the full list).
    expect(filterTransactionRows(rows, { status: 'Failed' })).toHaveLength(0);
  });

  // R7 — File is filtered by FileLogId (exact by id). The spread has 4 rows on
  // file 1001 and 2 on file 2002; a fileLogId filter narrows to exactly that file.
  it('filters by File (FileLogId) with an exact id match', () => {
    const rows = filterableRows();

    const file1001 = filterTransactionRows(rows, { fileLogId: 1001 });
    expect(file1001.map((r) => r.id).sort()).toEqual([5101, 5102, 5103, 5104]);

    const file2002 = filterTransactionRows(rows, { fileLogId: 2002 });
    expect(file2002.map((r) => r.id).sort()).toEqual([6101, 6102]);
  });

  // R7 — the Transaction-Date range uses INCLUSIVE YYYY-MM-DD bounds (boundary
  // days are kept, not excluded). The spread spans 2026-06-01 .. 2026-06-06.
  it('filters by an inclusive Transaction-Date range (boundaries included)', () => {
    const rows = filterableRows();

    // 06-02 .. 06-04 inclusive -> the three rows on those days (5102, 5103, 5104).
    const ranged = filterTransactionRows(rows, {
      dateFrom: '2026-06-02',
      dateTo: '2026-06-04',
    });
    expect(ranged.map((r) => r.id).sort()).toEqual([5102, 5103, 5104]);

    // An open lower bound keeps everything from 06-05 onward (6101, 6102).
    const fromOnly = filterTransactionRows(rows, { dateFrom: '2026-06-05' });
    expect(fromOnly.map((r) => r.id).sort()).toEqual([6101, 6102]);
  });

  // R7 — the Amount range uses INCLUSIVE numeric min/max (a NUMERIC compare, not a
  // lexical one). The spread amounts are 50 / 250 / 999.99 / 1500.50 / 4200 /
  // 9900.10. min=250 max=4200 keeps 250 / 999.99 / 1500.50 / 4200 — the boundary
  // values 250 and 4200 are included; the numeric compare excludes 9900.10 which a
  // lexical compare ("4200" < "9900.10") would also exclude, so the discriminating
  // boundary is 50 (below min) and the inclusive 4200 (at max).
  it('filters by an inclusive numeric Amount range (boundaries included)', () => {
    const rows = filterableRows();

    const ranged = filterTransactionRows(rows, {
      amountMin: 250,
      amountMax: 4200,
    });
    expect(ranged.map((r) => r.amount).sort((a, b) => a - b)).toEqual([
      250, 999.99, 1500.5, 4200,
    ]);

    // An open upper bound keeps everything at/above 1500.50 (1500.50, 4200, 9900.10).
    const minOnly = filterTransactionRows(rows, { amountMin: 1500.5 });
    expect(minOnly.map((r) => r.amount).sort((a, b) => a - b)).toEqual([
      1500.5, 4200, 9900.1,
    ]);
  });

  // R7 — free-text search is a case-insensitive SUBSTRING match on Reference OR
  // AccountNumber. "urgent" matches the one reference carrying that token; "-7788"
  // matches the one account number carrying that tail — proving the OR spans both
  // fields, not just Reference.
  it('filters by free-text as a case-insensitive substring on Reference OR Account Number', () => {
    const rows = filterableRows();

    // Reference-side match (case-insensitive).
    const byReference = filterTransactionRows(rows, { search: 'urgent' });
    expect(byReference.map((r) => r.id)).toEqual([5102]);

    // Account-number-side match — same predicate, the other field.
    const byAccount = filterTransactionRows(rows, { search: '-7788' });
    expect(byAccount.map((r) => r.id)).toEqual([6101]);
  });

  // R7 — the criteria COMPOSE with AND: every supplied criterion must hold. Status
  // Imported AND file 1001 AND a 06-01..06-02 date window narrows to exactly the
  // two Imported rows on file 1001 within that window (5101, 5102); dropping the
  // date bound or widening the file would admit more, proving the AND.
  it('composes all supplied criteria with AND', () => {
    const rows = filterableRows();

    const composed: TransactionFilters = {
      status: 'Imported',
      fileLogId: 1001,
      dateFrom: '2026-06-01',
      dateTo: '2026-06-02',
    };
    expect(
      filterTransactionRows(rows, composed)
        .map((r) => r.id)
        .sort(),
    ).toEqual([5101, 5102]);

    // Tightening with a search token that only 5102 carries narrows to one row —
    // the AND chains the free-text criterion on top of status+file+date.
    expect(
      filterTransactionRows(rows, { ...composed, search: 'URGENT' }).map(
        (r) => r.id,
      ),
    ).toEqual([5102]);
  });

  // ===================================================================
  // AC-6 — parseTransactionFilterParams: present / absent / malformed-safe
  // ===================================================================

  // AC-6 — the param names match buildTransactionsHref (`fileLogId`, `status`).
  // PRESENT: both params parse into the initial filter state (fileLogId coerced to
  // a number, status preserved). ABSENT: an empty query yields an empty filter set
  // (no crash, no stray keys). MALFORMED: a non-numeric fileLogId is dropped (NOT
  // coerced to NaN, which would silently match nothing); the well-formed status on
  // the same query still applies.
  it('parses ?fileLogId=&status= present, absent, and malformed without crashing', () => {
    // Present — both apply (mirrors /transactions?fileLogId=1001&status=Approved).
    const present = parseTransactionFilterParams(
      new URLSearchParams('fileLogId=1001&status=Approved'),
    );
    expect(present.fileLogId).toBe(1001);
    expect(typeof present.fileLogId).toBe('number');
    expect(present.status).toBe('Approved');

    // Absent — empty query -> empty (no fileLogId / status keys leak through).
    const absent = parseTransactionFilterParams(new URLSearchParams(''));
    expect(absent.fileLogId).toBeUndefined();
    expect(absent.status).toBeUndefined();

    // Malformed fileLogId — dropped (not NaN); the valid status still applies.
    const malformed = parseTransactionFilterParams(
      new URLSearchParams('fileLogId=not-a-number&status=Imported'),
    );
    expect(malformed.fileLogId).toBeUndefined();
    expect(malformed.status).toBe('Imported');
    // No NaN ever leaks into the filter state.
    expect(Number.isNaN(malformed.fileLogId as unknown as number)).toBe(false);
  });

  // R18 — activeFilterChips derives one chip descriptor per ACTIVE criterion (the
  // page renders these as the chip list). An empty filter set yields no chips; a
  // populated set yields a chip per set criterion with a user-readable label.
  it('derives one active-filter chip per set criterion (none when empty)', () => {
    expect(activeFilterChips({})).toHaveLength(0);

    const chips = activeFilterChips({
      status: 'Approved',
      fileLogId: 1001,
      search: 'TXN-100',
    });
    expect(chips).toHaveLength(3);
    // Each chip has a stable key and a label that names its criterion/value so the
    // chip is self-describing (R18). Assert the user-observable labels, not order.
    const labels = chips.map((c) => c.label.toLowerCase()).join(' | ');
    expect(labels).toContain('approved');
    expect(labels).toContain('1001');
    expect(labels).toContain('txn-100');
    // Keys are unique so React can render the list without collisions.
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length);
  });

  // ===================================================================
  // Integration render: filter narrows rows; chips + Clear-all; zero-results
  // (underpins the Playwright AC-1..AC-3 flows; BR11)
  // ===================================================================

  // AC-1 / AC-2 — applying the free-text filter narrows the rendered table to the
  // matching row, an active-filter chip appears, and Clear-all restores the full
  // list. Driven through the real page so the filter state + predicate + chip
  // rendering are proven wired together (jsdom complement to the Playwright flow).
  it('narrows the rendered rows on filter input, shows a chip, and Clear-all restores the full list', async () => {
    mockGet.mockResolvedValue(createMockFilterableTransactionsList());
    const user = userEvent.setup();

    render(<TransactionsPage />);

    // Full list rendered first (the URGENT row and at least one other reference).
    await waitFor(() => {
      expect(screen.getByText('TXN-10002-URGENT')).toBeInTheDocument();
    });
    expect(screen.getByText('TXN-10001')).toBeInTheDocument();

    // Type a free-text token only one row carries.
    const search = screen.getByLabelText(/search/i);
    await user.type(search, 'URGENT');

    // The table narrows to the single matching row; a non-matching reference goes.
    await waitFor(() => {
      expect(screen.queryByText('TXN-10001')).not.toBeInTheDocument();
    });
    expect(screen.getByText('TXN-10002-URGENT')).toBeInTheDocument();

    // An active-filter chip is shown for the applied search (R18), inside the
    // labelled "Active filters" region.
    const activeFilters = screen.getByRole('list', { name: /active filters/i });
    expect(within(activeFilters).getByText(/urgent/i)).toBeInTheDocument();

    // Clear-all removes the filter and restores the full list.
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await waitFor(() => {
      expect(screen.getByText('TXN-10001')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('list', { name: /active filters/i }),
    ).not.toBeInTheDocument();
  });

  // AC-3 / BR11 — a filter that matches NOTHING shows the zero-FILTER-results
  // state, which is DISTINCT from the zero-DATA "No transactions yet" copy and
  // keeps the active chips + Clear-all visible (so the user can recover). Data
  // exists (the API returned rows), so the no-data empty state must NOT show.
  it('shows a zero-filter-results state distinct from no-data, with chips and Clear-all still visible', async () => {
    mockGet.mockResolvedValue(createMockFilterableTransactionsList());
    const user = userEvent.setup();

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-10001')).toBeInTheDocument();
    });

    // A search token no row carries -> zero results.
    const search = screen.getByLabelText(/search/i);
    await user.type(search, 'no-such-reference-xyz');

    await waitFor(() => {
      expect(screen.queryByText('TXN-10001')).not.toBeInTheDocument();
    });

    // The zero-FILTER-results copy is distinct from the zero-DATA copy — the
    // "No transactions yet" no-data state must NOT be what shows here.
    expect(screen.queryByText(/no transactions yet/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/no.*match|no matching transactions/i),
    ).toBeInTheDocument();

    // Chips + Clear-all stay available so the user can recover (R18 / BR11).
    expect(
      screen.getByRole('list', { name: /active filters/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clear all/i }),
    ).toBeInTheDocument();
  });

  // AC-4 (jsdom complement) + NFR1 — opening with ?fileLogId=1001&status=Imported
  // pre-applies those as initial active filters (the page narrows to file 1001's
  // Imported rows on first paint and renders the matching chips) AND the filtered
  // view has no accessibility violations. This is the lower-cost jsdom guard for
  // the deep-link wiring; the full browser deep-link is the Playwright AC-4.
  it('pre-applies ?fileLogId=&status= deep-link filters on first render with no a11y violations', async () => {
    searchParamsRef.current = new URLSearchParams(
      'fileLogId=1001&status=Imported',
    );
    mockGet.mockResolvedValue(createMockFilterableTransactionsList());

    const { container } = render(<TransactionsPage />);

    // File 1001's Imported rows (5101 / 5102) are shown; an Approved row on the
    // same file (5103) and a different file's row (6101, Imported) are excluded —
    // proving BOTH params were applied as the initial filter.
    await waitFor(() => {
      expect(screen.getByText('TXN-10001')).toBeInTheDocument();
    });
    expect(screen.getByText('TXN-10002-URGENT')).toBeInTheDocument();
    expect(screen.queryByText('TXN-10003')).not.toBeInTheDocument();
    expect(screen.queryByText('TXN-20001')).not.toBeInTheDocument();

    // The deep-linked filters surface as active chips (R18).
    const activeFilters = screen.getByRole('list', { name: /active filters/i });
    expect(within(activeFilters).getByText(/imported/i)).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
