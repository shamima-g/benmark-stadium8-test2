/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (REPLACES the Epic-1 placeholder /transactions page)
 *
 * Epic 3, Story 1: Transactions table — columns, sorting, pagination, read-only view.
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (table columns + status badge per row), AC-2 (column sort asc/desc with
 *     active-direction indicator), AC-3 (always-rendered pagination, 5/10/20/50
 *     default 20 re-pages), AC-4 (neither role sees Approve/Reject), and AC-5
 *     (empty / loading / error-with-retry states) are PLAYWRIGHT-tagged. They are
 *     proven end-to-end against mocked GET /v1/transactions in the companion spec
 *     web/e2e/epic-3-story-1-transactions-table.spec.ts and are NOT duplicated as
 *     full-flow Vitest siblings.
 *   - AC-6 (vitest): the amount/sort comparators + status-badge mapping render
 *     correctly — numeric amount sort, currency formatting, status label. Covered
 *     directly by the unit blocks below.
 *
 * What this Vitest file DOES cover — the jsdom-observable units that UNDERPIN the
 * Playwright flows and are this story's highest-value regression surface:
 *   1. The TransactionRead -> table-row MAPPING (toTransactionRow): the exact
 *      PascalCase fields from documentation/transactions-api.yaml (Reference,
 *      TransactionDate, AccountNumber, Description, Amount, Currency,
 *      TransactionType, Status). Per project-brief §13 the TransactionType enum is
 *      ambiguous (full word "Debit"/"Credit" in the OpenAPI example vs single-char
 *      C/D codes in the sample CSV) — the mapper normalises BOTH forms to a stable
 *      display label defensively.
 *   2. The single-column SORT comparator (R17): numeric for Amount, chronological
 *      for Transaction Date, lexical for text columns — asc on first click, desc on
 *      second, pure (input order preserved).
 *   3. PAGINATION slicing (R16): page sizes 5/10/20/50 default 20.
 *   4. The transaction status-badge mapping (project-brief §11): Imported -> info,
 *      Approved -> success, Rejected -> error. Asserts the user-visible LABEL and
 *      the semantic VARIANT — never a hex value (CLAUDE.md §2 styling-centralisation).
 *   5. Currency/amount FORMATTING (AC-6): a ZAR amount formats with a thousands
 *      separator and two decimals.
 *   6. A focused integration render of the page asserting the rendering DECISIONS
 *      this story owns: the read-only-for-the-Importer invariant (an Importer sees
 *      NO action control — BR9), the zero-DATA empty state ("No transactions yet",
 *      no creation prompt — BR11), and the error-with-retry state (NFR5).
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R6 (§7): Transactions table columns Reference, Transaction Date, Account,
 *     Description, Amount, Currency, Transaction Type, Status.
 *   - R16/R17 (§7): page sizes 5/10/20/50 default 20; single-column asc-then-desc.
 *   - BR9 (§8): Approve/Reject are Approver-only row actions; an Importer sees the
 *     Transactions table read-only with NO action controls. (Epic 4 adds the
 *     Approver Approve action; the Importer read-only invariant is unchanged.)
 *   - BR11 (§8): zero-DATA empty state ("No transactions yet") carries NO creation
 *     prompt (transactions are created by file upload, not on this page).
 *   - NFR5 (§10): every async load has a user-visible error state with a retry.
 *   - §11: status badge mapping — Approved -> success; Rejected -> error;
 *     Imported -> info. Colour is always paired with a label.
 *   - §13: TransactionType is ambiguous (Debit/Credit vs C/D) — handle defensively.
 *
 * EXTRACTED / GENERALISED HELPERS the developer must create (see the failing
 * imports below). Keeping the mapping / sort / pagination logic pure is what lets
 * these units be asserted in jsdom without recreating the full Playwright flows.
 * The planner asked to GENERALISE Epic-2's file-logs sort/pagination into a shared
 * generic table core consumed by BOTH file-logs and transactions:
 *
 *   GENERIC (shared, new):
 *     - web/src/lib/table/sort.ts
 *         -> compareValues(a, b, kind) for kind 'string' | 'number' | 'date'
 *         -> sortRows<T>(rows, accessor, kind, direction): pure generic sort
 *         -> type SortDirection ('asc' | 'desc')
 *     - web/src/lib/table/pagination.ts
 *         -> paginate<T>(rows, page, pageSize): pure generic slice
 *         -> pageCount(totalRows, pageSize)
 *         -> PAGE_SIZE_OPTIONS ([5,10,20,50]), DEFAULT_PAGE_SIZE (20)
 *     (Epic-2's web/src/lib/file-logs/{sort,pagination}.ts should be refactored to
 *      re-export / delegate to these — the file-logs callers and tests must keep
 *      working; no behaviour change there.)
 *
 *   TRANSACTIONS-SPECIFIC (new):
 *     - web/src/lib/transactions/mapping.ts
 *         -> toTransactionRow(tx): TransactionRow, TransactionRow interface,
 *            transactionStatusBadge(status): StatusBadge (REUSE the §11 mapping —
 *            delegate to @/lib/file-logs/mapping fileStatusBadge so Imported/
 *            Approved/Rejected resolve identically), formatAmount(amount, currency)
 *     - web/src/lib/transactions/sort.ts
 *         -> sortTransactionRows(rows, column, direction), TransactionSortColumn
 *            (delegates to the generic table sort core)
 *
 * The TransactionRead / TransactionReadList types already exist in
 * web/src/types/api.ts and getTransactions() already exists in
 * web/src/lib/api/transactions.ts (Epic 2, Story 3).
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/`
 * Vite alias does not resolve the parenthesised group segment, so the page is
 * imported via a relative path (helper modules under @/lib resolve normally).
 *
 * These tests WILL FAIL until the helpers and page are implemented (TDD red).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import TransactionsPage from '../../app/(app)/transactions/page';
import {
  toTransactionRow,
  transactionStatusBadge,
  formatAmount,
} from '@/lib/transactions/mapping';
import { sortTransactionRows } from '@/lib/transactions/sort';
import {
  paginate,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '@/lib/table/pagination';

import { get } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockTransaction,
  createMockTransactions,
  createMockTransactionsList,
} from '../helpers/epic-3-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the mappers, the comparators). The page fetches the full list via
// GET /v1/transactions (no server-side params — the approved spec gap); we drive
// that boundary here.
vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;

// The page reads the signed-in user from the session to render the role-aware
// view. Mock the hook so each test can model the persona; the real
// SessionProvider path is Epic-1 baseline coverage.
vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// The page consumes the Epic-1 toast system (a row-action feedback channel added
// in Epic 4). Mock the context so this Epic-3 render does not depend on the toast
// provider machinery — the toast behaviour itself is covered by its own stories.
vi.mock('@/contexts/ToastContext', () => ({
  useToast: vi.fn(() => ({
    toasts: [],
    showToast: vi.fn(),
    dismissToast: vi.fn(),
    clearAllToasts: vi.fn(),
  })),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/transactions',
  useSearchParams: () => new URLSearchParams(),
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

describe('Epic 3, Story 1: Transactions table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // Unit: TransactionRead -> row mapping (underpins AC-1; §13 defensive type)
  // ===================================================================

  // R6 / §6 — the row exposes the brief's columns from the PascalCase API fields.
  // §13 — TransactionType is ambiguous; the mapper normalises BOTH the full-word
  // form ("Debit"/"Credit") AND the single-character code form ("D"/"C") to a
  // stable, human-readable display label so the table never shows a bare "D".
  it('maps a TransactionRead onto a row and normalises the ambiguous TransactionType', () => {
    const fullWordRow = toTransactionRow(
      createMockTransaction({
        Id: 7001,
        Reference: 'TXN-09001',
        TransactionDate: '2026-06-01T10:00:00Z',
        AccountNumber: '1001-2034-5567',
        Description: 'Payment for invoice 1234',
        Amount: 1500.5,
        TransactionType: 'Debit',
        Currency: 'ZAR',
        Status: 'Imported',
      }),
    );

    expect(fullWordRow.id).toBe(7001);
    expect(fullWordRow.reference).toBe('TXN-09001');
    expect(fullWordRow.transactionDate).toBe('2026-06-01T10:00:00Z');
    expect(fullWordRow.account).toBe('1001-2034-5567');
    expect(fullWordRow.description).toBe('Payment for invoice 1234');
    expect(fullWordRow.amount).toBe(1500.5);
    expect(typeof fullWordRow.amount).toBe('number');
    expect(fullWordRow.currency).toBe('ZAR');
    expect(fullWordRow.status).toBe('Imported');
    // Full-word form is preserved as a Debit display label.
    expect(fullWordRow.transactionType.toLowerCase()).toContain('debit');

    // Single-character code form ("D") must resolve to the same Debit label, and
    // "C" to a Credit label — never a bare single character in the display.
    const debitCode = toTransactionRow(
      createMockTransaction({ TransactionType: 'D' }),
    );
    const creditCode = toTransactionRow(
      createMockTransaction({ TransactionType: 'C' }),
    );
    expect(debitCode.transactionType.toLowerCase()).toContain('debit');
    expect(creditCode.transactionType.toLowerCase()).toContain('credit');
  });

  // ===================================================================
  // Unit: transaction status-badge mapping (underpins AC-1; §11)
  // ===================================================================

  // §11 — transaction statuses map to the shared status variants. Assert the
  // user-observable LABEL and the semantic VARIANT, never a hex value (CLAUDE.md
  // §2 styling-centralisation: the contract is the variant name, not the colour).
  it.each([
    ['Imported', 'info'],
    ['Approved', 'success'],
    ['Rejected', 'error'],
  ])(
    'maps transaction status %s to a labelled badge with the %s variant',
    (status, variant) => {
      const badge = transactionStatusBadge(status);
      expect(badge.variant).toBe(variant);
      // The label is the user-visible status text — colour is never used alone.
      expect(badge.label.toLowerCase()).toContain(status.toLowerCase());
    },
  );

  // ===================================================================
  // Unit: single-column sort comparator (AC-6; underpins AC-2; R17)
  // ===================================================================

  // R17 / AC-6 — Amount sorts NUMERICALLY (75 < 320.40 < 480.25 < 1500.50 <
  // 9900.10), NOT lexically (where "1500.50" < "480.25"). Asc on first click, desc
  // on second. The comparator is pure (input order preserved).
  it('sorts the Amount column numerically (not lexically) ascending then descending', () => {
    const rows = createMockTransactions().map(toTransactionRow);

    const amountAsc = sortTransactionRows(rows, 'amount', 'asc');
    const amountDesc = sortTransactionRows(rows, 'amount', 'desc');

    // Smallest first ascending — proves numeric ordering, since lexical order
    // would put "12.99" and "1500.50" adjacent ahead of "320.40".
    expect(amountAsc.map((r) => r.amount)).toEqual([
      12.99, 75, 320.4, 480.25, 1500.5, 9900.1,
    ]);
    expect(amountDesc.map((r) => r.amount)).toEqual([
      9900.1, 1500.5, 480.25, 320.4, 75, 12.99,
    ]);

    // Pure — the input order is not mutated.
    expect(rows[0].reference).toBe('TXN-00001');
  });

  // R17 — the date column sorts chronologically and text columns lexically, across
  // the distinct value-types so the comparator is proven not to stringify dates.
  it('sorts the Transaction Date chronologically and the Reference column lexically', () => {
    const rows = createMockTransactions().map(toTransactionRow);

    const dateAsc = sortTransactionRows(rows, 'transactionDate', 'asc');
    const dateDesc = sortTransactionRows(rows, 'transactionDate', 'desc');
    // Earliest first ascending (2026-06-01), latest first descending (2026-06-06).
    expect(dateAsc[0].transactionDate).toBe('2026-06-01T10:00:00Z');
    expect(dateDesc[0].transactionDate).toBe('2026-06-06T16:20:00Z');

    const refAsc = sortTransactionRows(rows, 'reference', 'asc');
    const refDesc = sortTransactionRows(rows, 'reference', 'desc');
    expect(refAsc[0].reference).toBe('TXN-00001');
    expect(refDesc[0].reference).toBe('TXN-00006');
  });

  // ===================================================================
  // Unit: pagination slicing (underpins AC-3; R16)
  // ===================================================================

  // R16 — page-size options are exactly 5/10/20/50 with a default of 20; the
  // generic slice returns the correct window for a given 1-based page.
  it('exposes the 5/10/20/50 page sizes (default 20) and slices to the requested page', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([5, 10, 20, 50]);
    expect(DEFAULT_PAGE_SIZE).toBe(20);

    const rows = createMockTransactions().map(toTransactionRow); // 6 rows

    // Page size 5 -> page 1 holds the first 5, page 2 holds the remaining 1.
    const page1 = paginate(rows, 1, 5);
    const page2 = paginate(rows, 2, 5);
    expect(page1).toHaveLength(5);
    expect(page2).toHaveLength(1);
    expect(page1[0].id).toBe(rows[0].id);
    expect(page2[0].id).toBe(rows[5].id);

    // A page size that exceeds the row count returns all rows on page 1.
    expect(paginate(rows, 1, 20)).toHaveLength(rows.length);
  });

  // ===================================================================
  // Unit: currency / amount formatting (AC-6)
  // ===================================================================

  // AC-6 — a ZAR amount formats with a thousands separator and two decimal places
  // so the Amount column is read as money, not a bare float. The exact currency
  // glyph is locale-dependent; assert the digit grouping + decimals which are the
  // load-bearing, user-observable contract.
  it('formats a ZAR amount with a thousands separator and two decimals', () => {
    const formatted = formatAmount(1500.5, 'ZAR');
    // Two decimal places retained.
    expect(formatted).toContain('1');
    expect(formatted).toMatch(/1[ ,. ]?500[.,]50/);

    // A round value still shows two decimals.
    expect(formatAmount(75, 'ZAR')).toMatch(/75[.,]00/);
  });

  // ===================================================================
  // Integration render: read-only invariant + empty / error states (AC-4/5, BR9/11)
  // ===================================================================

  // BR9 — an Importer sees the Transactions table READ-ONLY with NO action
  // controls (neither Approve nor Reject) on any row, regardless of row status.
  // (Epic 4 adds the Approver-only Approve action; the Importer read-only
  // invariant guarded here is unchanged.) This is the lower-cost jsdom guard that
  // complements the Playwright role coverage.
  it('renders no Approve or Reject control for an Importer (read-only — BR9)', async () => {
    mockGet.mockResolvedValue(createMockTransactionsList());
    mockUseSession.mockReturnValue(sessionFor(['Importer']));

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-00001')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /approve/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reject/i }),
    ).not.toBeInTheDocument();
  });

  // BR11 — zero-DATA empty state: when the API returns no transactions, the
  // "No transactions yet" empty state shows and carries NO creation prompt
  // (transactions are created by file upload, not on this read-only page).
  it('shows the "No transactions yet" empty state with no creation prompt when the list is empty', async () => {
    mockGet.mockResolvedValue(createMockTransactionsList([]));

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument();
    });
    // Read-only surface — no upload/create/add affordance in the empty state.
    expect(
      screen.queryByRole('button', { name: /upload|create|add/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /upload|create|add/i }),
    ).not.toBeInTheDocument();
  });

  // NFR5 — a failed load shows a user-visible error state with a Retry affordance
  // (errors are never silently swallowed). Clicking Retry re-issues the fetch.
  it('shows an error state with a working Retry when the transactions load fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retry = screen.getByRole('button', { name: /retry/i });
    // On retry the fetch succeeds and the table renders.
    mockGet.mockResolvedValueOnce(createMockTransactionsList());
    await user.click(retry);

    await waitFor(() => {
      expect(screen.getByText('TXN-00001')).toBeInTheDocument();
    });
  });

  // NFR1 — the loaded table has no accessibility violations.
  it('has no accessibility violations once the transactions have loaded', async () => {
    mockGet.mockResolvedValue(createMockTransactionsList());

    const { container } = render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-00001')).toBeInTheDocument();
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
