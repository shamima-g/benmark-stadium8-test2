/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing — adds an Approver-only Export control ONTO the
 *   Story-1/2 transactions table + filter set (the table, sort, pagination,
 *   filter bar, chips, and zero-results states are NOT rebuilt; this story layers
 *   an Export toolbar control + a pure CSV builder on top).
 *
 * Epic 3, Story 3: Approver export of the filtered transactions as CSV
 * (R11 / BR6 / BR9).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (an Approver sees an Export control; an Importer does not), AC-2
 *     (clicking Export downloads a CSV of EXACTLY the currently-filtered rows —
 *     not the whole list — with a filename reflecting the active filters + date),
 *     and AC-3 (when nothing matches the active filters, Export is disabled and
 *     explains why) are PLAYWRIGHT-tagged: AC-2's browser download (Blob + anchor
 *     click + the `download` event) can only be proven in a real browser, so the
 *     three are exercised end-to-end in the companion spec
 *     web/e2e/epic-3-story-3-transactions-csv-export.spec.ts and are NOT
 *     duplicated as full-flow Vitest siblings.
 *   - AC-4 (vitest): the CSV builder serialises EXACTLY the supplied filtered rows
 *     (in order) with the brief's columns + a header row, escaping values
 *     RFC4180-style, and the filename reflects the active filters + date. Covered
 *     directly by the buildTransactionsCsv / buildTransactionsCsvFilename unit
 *     blocks below.
 *
 * What this Vitest file ALSO covers — the pure role-gating + disabled-state logic
 * that UNDERPINS the Playwright AC-1 / AC-3 flows, plus a focused page render that
 * proves the page wires those predicates to the toolbar:
 *   - canExportTransactions(roles): Export is Approver-only (BR9 read-only;
 *     Importers never see it) — the predicate the page gates VISIBILITY off.
 *   - canExportNow(filteredRowCount): false when zero rows match (BR6) — the
 *     predicate the page gates the DISABLED state off.
 *   - the page render: an Approver sees an Export control; an Importer does NOT
 *     (hidden, not disabled-for-Importer — denied actions are HIDDEN per
 *     project-brief §2); and when the active filter set matches zero rows the
 *     Export control is rendered DISABLED with an explanation (BR6).
 *
 * NOTE on the download mechanism: the actual browser download (Blob construction +
 * anchor click + the `download` attribute/event) is exercised in Playwright
 * (AC-2). In jsdom we assert the pure builders' STRING and FILENAME outputs and
 * the gating decisions — never the DOM download mechanism (jsdom does not
 * implement navigation/download, so asserting it here would be a brittle
 * library-internal test).
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R11 (§7): an Approver may export the currently-filtered set of Transactions
 *     as a CSV named to reflect the active filter and date.
 *   - BR6 (§8, blocker): the exported row-set must EQUAL exactly the currently-
 *     applied filter set; Export is disabled (with an explanation) when zero rows
 *     match the current filter.
 *   - BR9 (§8, blocker): Importers see the Transactions table read-only with no
 *     action controls — Export is Approver-only.
 *   - §2: denied actions are HIDDEN in the UI, not rendered as disabled controls
 *     (so the Importer sees NO Export control at all, rather than a disabled one).
 *   - R6 (§7): the brief's transaction columns are Reference, Transaction Date,
 *     Account, Description, Amount, Currency, Transaction Type, Status — the CSV
 *     header row and column order mirror these.
 *
 * EXTRACTED HELPERS the developer must create (the failing imports below):
 *
 *   - web/src/lib/transactions/csv.ts
 *       -> buildTransactionsCsv(rows: TransactionRow[]): string
 *          A header row with the brief's columns (Reference, Transaction Date,
 *          Account, Description, Amount, Currency, Transaction Type, Status) then
 *          one line per row, in the SUPPLIED ORDER (no re-sort), RFC4180-style:
 *          a value containing a comma, a double-quote, or a newline is wrapped in
 *          double quotes, and an embedded double-quote is doubled (`"` -> `""`).
 *          Lines are joined with CRLF (`\r\n`), RFC4180 §2.1.
 *       -> buildTransactionsCsvFilename(filters: TransactionFilters, date: Date |
 *          string): string — a filename reflecting the active filters and the date
 *          (e.g. transactions_<filter-summary>_<YYYY-MM-DD>.csv). The date is a
 *          PARAMETER (injectable) so the test is deterministic — buildTransactions
 *          CsvFilename must NOT call new Date() internally.
 *
 *   - web/src/lib/transactions/exportGating.ts
 *       -> canExportTransactions(roles: string[]): boolean — Approver-only (BR9 /
 *          BR6); mirrors the @/lib/files/lifecycleGating role-predicate convention
 *          (case-insensitive role-name match, null-safe).
 *       -> canExportNow(filteredRowCount: number): boolean — false when the
 *          filtered set is empty (BR6 disabled state), true otherwise.
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/`
 * Vite alias does not resolve the parenthesised group segment, so the page is
 * imported via a relative path (helper modules under @/lib resolve normally).
 *
 * These tests WILL FAIL until the helpers and page changes are implemented (TDD red).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import TransactionsPage from '../../app/(app)/transactions/page';
import {
  toTransactionRow,
  type TransactionRow,
} from '@/lib/transactions/mapping';
import type { TransactionFilters } from '@/lib/transactions/filter';
import {
  buildTransactionsCsv,
  buildTransactionsCsvFilename,
} from '@/lib/transactions/csv';
import {
  canExportTransactions,
  canExportNow,
} from '@/lib/transactions/exportGating';

import { get } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockTransaction,
  createMockFilterableTransactionsList,
} from '../helpers/epic-3-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the CSV builder, the gating predicates). The page fetches the full list via
// GET /v1/transactions (no server-side params — the approved spec gap) and filters
// client-side; we drive that one boundary here.
vi.mock('@/lib/api/client', () => ({ get: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;

vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// The page reads the URL query params for the deep-link-in filters (Story 2).
// Each render-test that needs an initial filter overrides this; the default is an
// empty query string.
const searchParamsRef = { current: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/transactions',
  useSearchParams: () => searchParamsRef.current,
}));

/** A loaded session for the given role (default Approver — the export persona). */
function sessionFor(roles: string[] = ['Approver']) {
  return {
    user: createMockAuthUser({ roles }),
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  };
}

/**
 * Two plain rows for the CSV builder. Kept minimal and explicit (not the §13
 * spread) so the serialised output is exactly predictable line-for-line.
 */
function plainRows(): TransactionRow[] {
  return [
    toTransactionRow(
      createMockTransaction({
        Id: 1,
        FileLogId: 1001,
        Reference: 'TXN-00001',
        TransactionDate: '2026-06-01T10:00:00Z',
        AccountNumber: '1001-2034-5567',
        Description: 'Payment for invoice 1234',
        Amount: 1500.5,
        TransactionType: 'Debit',
        Currency: 'ZAR',
        Status: 'Imported',
      }),
    ),
    toTransactionRow(
      createMockTransaction({
        Id: 2,
        FileLogId: 1001,
        Reference: 'TXN-00002',
        TransactionDate: '2026-06-02T09:30:00Z',
        AccountNumber: '1001-2034-9988',
        Description: 'Salary deposit',
        Amount: 9900.1,
        TransactionType: 'Credit',
        Currency: 'ZAR',
        Status: 'Approved',
      }),
    ),
  ];
}

describe('Epic 3, Story 3: Approver CSV export of the filtered set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // AC-4 — buildTransactionsCsv: header row + exact rows, in order, escaped
  // ===================================================================

  // AC-4 / R6 — the first line is the header row carrying the brief's eight
  // columns in the documented order (Reference, Transaction Date, Account,
  // Description, Amount, Currency, Transaction Type, Status), and each supplied row
  // serialises onto its own line in the SUPPLIED ORDER (no re-sort). Lines are
  // CRLF-joined (RFC4180 §2.1).
  it('serialises a header row with the brief columns then one line per row, in supplied order', () => {
    const csv = buildTransactionsCsv(plainRows());
    const lines = csv.split('\r\n');

    // Header row first — the brief's R6 columns in order.
    expect(lines[0]).toBe(
      'Reference,Transaction Date,Account,Description,Amount,Currency,Transaction Type,Status',
    );

    // Exactly two data lines follow (no trailing blank, no extra rows).
    expect(lines).toHaveLength(3);

    // Row 1 then Row 2 — the supplied order is preserved, the normalised
    // TransactionType label is used, and every brief column is present.
    expect(lines[1]).toBe(
      'TXN-00001,2026-06-01T10:00:00Z,1001-2034-5567,Payment for invoice 1234,1500.5,ZAR,Debit,Imported',
    );
    expect(lines[2]).toBe(
      'TXN-00002,2026-06-02T09:30:00Z,1001-2034-9988,Salary deposit,9900.1,ZAR,Credit,Approved',
    );
  });

  // AC-4 — the row-set serialised is EXACTLY the supplied set (BR6): a one-row
  // input yields a header + exactly that one row, never the full unfiltered list.
  // This is the unit-level proof of the BR6 "exactly the filtered set" contract
  // that the page wires (the filtered array is what the page hands the builder).
  it('serialises exactly the supplied rows — a single filtered row yields header + that one row only', () => {
    const [first] = plainRows();
    const csv = buildTransactionsCsv([first]);
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Reference');
    expect(lines[1]).toBe(
      'TXN-00001,2026-06-01T10:00:00Z,1001-2034-5567,Payment for invoice 1234,1500.5,ZAR,Debit,Imported',
    );
    // The second plain row is NOT present — only the supplied subset is serialised.
    expect(csv).not.toContain('TXN-00002');
    expect(csv).not.toContain('Salary deposit');
  });

  // AC-4 — RFC4180 escaping: a value containing a comma, a double-quote, or a
  // newline is wrapped in double quotes; an embedded double-quote is DOUBLED. A
  // plain value is left bare. This protects the Description column (free text from
  // the bank file) from breaking the column structure.
  it('escapes values RFC4180-style (quote-wrap commas / quotes / newlines, double embedded quotes)', () => {
    const row = toTransactionRow(
      createMockTransaction({
        Id: 9,
        Reference: 'TXN-09999',
        TransactionDate: '2026-06-09T12:00:00Z',
        AccountNumber: '1001-2034-0000',
        // Comma + embedded double-quote + a newline, all in one field.
        Description: 'Payment, "urgent"\nsecond line',
        Amount: 42,
        TransactionType: 'Debit',
        Currency: 'ZAR',
        Status: 'Imported',
      }),
    );

    const csv = buildTransactionsCsv([row]);
    const dataLine = csv.slice(csv.indexOf('\r\n') + 2);

    // The Description field is quote-wrapped (it carries a comma and a quote),
    // the embedded `"` is doubled to `""`, and the embedded newline is preserved
    // INSIDE the quotes (RFC4180 §2.6) — so the field is one CSV field that simply
    // spans a physical newline.
    expect(dataLine).toContain('"Payment, ""urgent""\nsecond line"');

    // A plain, separator-free value is NOT quote-wrapped.
    expect(dataLine).toContain('TXN-09999');
    expect(dataLine).not.toContain('"TXN-09999"');
    expect(dataLine).not.toContain('"ZAR"');
  });

  // ===================================================================
  // AC-4 — buildTransactionsCsvFilename: reflects active filters + date
  // ===================================================================

  // AC-4 / R11 — the filename reflects the active filters AND the date, and the
  // date is INJECTED (a parameter) so the output is deterministic — the builder
  // must NOT call new Date() internally. A populated filter set surfaces its
  // active criteria in the name; the supplied date renders as YYYY-MM-DD; the
  // extension is .csv.
  it('builds a filename reflecting the active filters and the injected date', () => {
    const filters: TransactionFilters = { status: 'Approved', fileLogId: 1001 };
    const name = buildTransactionsCsvFilename(
      filters,
      new Date('2026-06-09T08:30:00Z'),
    );

    // Names the dataset, reflects the active filter values, and carries the
    // injected date as YYYY-MM-DD with a .csv extension.
    expect(name).toMatch(/^transactions_/);
    expect(name.toLowerCase()).toContain('approved');
    expect(name).toContain('1001');
    expect(name).toContain('2026-06-09');
    expect(name).toMatch(/\.csv$/);

    // Deterministic — the SAME injected date yields the SAME name (no new Date()).
    expect(
      buildTransactionsCsvFilename(filters, new Date('2026-06-09T08:30:00Z')),
    ).toBe(name);
  });

  // AC-4 / R11 — with NO active filters the filename still reflects the date and
  // the .csv extension, marking the export as the unfiltered ("all") set rather
  // than embedding stale filter tokens. The injected date stays deterministic.
  it('builds an unfiltered filename carrying the date when no filters are active', () => {
    const name = buildTransactionsCsvFilename(
      {},
      new Date('2026-06-09T23:59:00Z'),
    );

    expect(name).toMatch(/^transactions_/);
    expect(name).toContain('2026-06-09');
    expect(name).toMatch(/\.csv$/);
    // No stray filter tokens leak in for an empty filter set.
    expect(name.toLowerCase()).not.toContain('approved');
  });

  // ===================================================================
  // AC-1 / AC-3 underpinning — pure gating predicates
  // ===================================================================

  // AC-1 / BR9 — Export is Approver-only. An Approver is granted; an Importer is
  // NOT (so the page hides the control entirely — §2). The match mirrors the
  // established lifecycle-gating convention: case-insensitive role-name match,
  // null-safe (a missing/empty role set is never granted).
  it('canExportTransactions grants Approver only (Importer denied, null-safe, case-insensitive)', () => {
    expect(canExportTransactions(['Approver'])).toBe(true);
    expect(canExportTransactions(['approver'])).toBe(true); // case-insensitive
    expect(canExportTransactions(['Importer'])).toBe(false);
    // A user with both roles can still export (Approver present).
    expect(canExportTransactions(['Importer', 'Approver'])).toBe(true);
    // Null-safe / empty — never granted.
    expect(canExportTransactions([])).toBe(false);
    expect(canExportTransactions(undefined as unknown as string[])).toBe(false);
  });

  // AC-3 / BR6 — Export is enabled only when at least one row matches the active
  // filter. A zero-row filtered set disables it (the page renders the disabled
  // state + explanation off this predicate).
  it('canExportNow is false for an empty filtered set and true otherwise', () => {
    expect(canExportNow(0)).toBe(false);
    expect(canExportNow(1)).toBe(true);
    expect(canExportNow(6)).toBe(true);
  });

  // ===================================================================
  // Integration render: Export visible for Approver / hidden for Importer;
  // disabled-with-explanation on a zero-result filter (underpins AC-1 / AC-3)
  // ===================================================================

  // AC-1 / BR9 / §2 — an Approver sees the Export control. Driven through the real
  // page so the canExportTransactions gate is proven WIRED to the toolbar.
  it('renders an Export control for an Approver', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(createMockFilterableTransactionsList());

    render(<TransactionsPage />);

    // The table loads (an Approver lands here as their primary surface).
    await waitFor(() => {
      expect(screen.getByText('TXN-10001')).toBeInTheDocument();
    });

    // The Export control is present and enabled (rows match the empty filter).
    const exportControl = screen.getByRole('button', { name: /export/i });
    expect(exportControl).toBeInTheDocument();
    expect(exportControl).toBeEnabled();
  });

  // AC-1 / BR9 / §2 — an Importer does NOT see the Export control at all (hidden,
  // not a disabled-for-Importer control — denied actions are HIDDEN per §2). The
  // Importer still sees the read-only table.
  it('hides the Export control entirely from an Importer (not disabled — hidden)', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Importer']));
    mockGet.mockResolvedValue(createMockFilterableTransactionsList());

    render(<TransactionsPage />);

    // The Importer sees the read-only table.
    await waitFor(() => {
      expect(screen.getByText('TXN-10001')).toBeInTheDocument();
    });

    // No Export control is rendered for the Importer — neither enabled NOR
    // disabled (the action is HIDDEN, not gated as disabled).
    expect(
      screen.queryByRole('button', { name: /export/i }),
    ).not.toBeInTheDocument();
  });

  // AC-3 / BR6 — when the active filter set matches ZERO rows, the Approver's
  // Export control is rendered DISABLED with an explanation (it cannot export an
  // empty set). Deep-linked with a filter that matches nothing so the page paints
  // the zero-result state. No accessibility violations on the disabled-export view.
  it('disables Export with an explanation for an Approver when the filter matches zero rows', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    // status=Failed matches none of the filterable spread (Imported/Approved/Rejected only).
    searchParamsRef.current = new URLSearchParams('status=Failed');
    mockGet.mockResolvedValue(createMockFilterableTransactionsList());

    const { container } = render(<TransactionsPage />);

    // The zero-FILTER-results state paints (data exists; the filter excludes all).
    await waitFor(() => {
      expect(screen.queryByText('TXN-10001')).not.toBeInTheDocument();
    });

    // The Export control is still present (Approver) but DISABLED, and carries a
    // user-readable explanation of why (BR6: nothing to export).
    const exportControl = screen.getByRole('button', { name: /export/i });
    expect(exportControl).toBeDisabled();
    // The explanation is associated with the control so it is discoverable
    // (tooltip / aria-describedby / accessible description — assert the readable
    // copy, not the wiring mechanism).
    expect(
      screen.getByText(
        /no.*transactions.*to export|nothing to export|no rows to export/i,
      ),
    ).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
