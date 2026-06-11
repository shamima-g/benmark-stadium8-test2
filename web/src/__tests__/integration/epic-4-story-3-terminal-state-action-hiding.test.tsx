/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing — makes BR1's terminal-state suppression EXPLICIT and
 *   tested on the existing Transactions table, and ADDS a top-of-page terminal-state
 *   banner plus a concurrent-change guard on the confirm handlers. The Story-1/2 gated
 *   row-actions cell, the canActionTransaction role gate, the alert-dialog primitives,
 *   the TransactionRow mapping, and the fetch → filter → sort → paginate pipeline are
 *   REUSED — nothing in that pipeline is rebuilt.
 *
 * Epic 4, Story 3: Hiding actions once a transaction is decided (BR1).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (playwright): Approved/Rejected rows show no Approve/Reject action for an
 *     Approver; only Imported rows show them — proven end-to-end in the companion spec.
 *     The terminal-state suppression WIRING (the actionability predicate driving the
 *     row-actions cell) is asserted directly here and in the render below.
 *   - AC-2 (playwright): when visible rows include any terminal (Approved/Rejected) row,
 *     a top-of-page banner explains decided transactions can no longer be actioned —
 *     proven browser-observable in Playwright; the banner's appear/not-appear logic
 *     based on the visible rows is asserted in the renders below.
 *   - AC-3 (vitest): the rule that decides whether actions are available returns true
 *     ONLY for the Imported status and false for Approved and Rejected — covered
 *     THOROUGHLY by the isActionableTransactionStatus unit blocks below.
 *   - AC-4 (playwright): confirming an action on a row that is already decided dismisses
 *     the box with an explanation instead of changing the status — the FULL race (open
 *     modal -> server-side concurrent change -> confirm) is browser/refetch territory
 *     proven in Playwright; its load-bearing DECISION RULE (the same actionability
 *     predicate, applied at confirm time) is asserted here.
 *
 * What this Vitest file covers — AC-3 thoroughly, plus the unit/integration logic that
 * UNDERPINS the Playwright AC-1 / AC-2 / AC-4 flows and is best asserted in jsdom (the
 * pure actionability predicate over the whole status vocabulary; the terminal-state
 * banner appearing/not-appearing based on the visible rows; the terminal-state
 * suppression of the row-actions on the real page render):
 *   - isActionableTransactionStatus(status): true ONLY for 'Imported'; false for
 *     'Approved', 'Rejected', and any other/unknown/empty status. Case-sensitive on the
 *     canonical §11 vocabulary; null-safe (a missing status is never actionable). This is
 *     the single rule the row-actions cell gates off (AC-1) and the confirm-time
 *     concurrent-change guard re-checks (AC-4) — so a decided row is never re-actioned.
 *   - the page render: an Approver sees Approve/Reject on Imported rows and NONE on
 *     Approved/Rejected rows (terminal-state suppression — AC-1); a top-of-page banner
 *     naming the read-only/decided state is shown when the visible rows include any
 *     terminal row, and is ABSENT when every visible row is still Imported (AC-2).
 *
 * NOTE on AC-4: the full concurrent-change race — open the modal, the row is changed
 * server-side, then confirm — depends on a fresh server fetch landing while the modal is
 * open, which is browser/refetch behaviour proven end-to-end in Playwright. In jsdom we
 * assert its load-bearing DECISION RULE (the actionability predicate the guard re-checks
 * at confirm time), not a contrived single-page race that would be a brittle
 * implementation test.
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - BR1 (§8, blocker): when a Transaction's Status is not 'Imported', the Approve and
 *     Reject row-actions are HIDDEN — mutating actions are suppressed on terminal records
 *     — and a top-of-page banner names the terminal state.
 *   - §9 (Transaction Review workflow): for Imported rows (Approver only) Approve/Reject
 *     are available; for Approved/Rejected rows row-actions are hidden and a
 *     terminal-state banner is shown at page top; on a concurrent change (row already
 *     non-Imported at confirm) the modal is dismissed with a banner explaining the new
 *     state, rather than mutating.
 *   - §11: the Transaction status vocabulary is Imported / Approved / Rejected.
 *
 * EXTRACTED HELPER the developer must create/extend (the failing import below):
 *
 *   - web/src/lib/transactions/actionGating.ts  (EXTEND — canActionTransaction, the
 *     ROLE gate, already present)
 *       -> isActionableTransactionStatus(status: string | null | undefined): boolean —
 *          true ONLY when the row's Status is the actionable 'Imported' state; false for
 *          the terminal 'Approved' / 'Rejected' states and for any unknown/empty/missing
 *          status. This is the STATE half of the gate (canActionTransaction is the ROLE
 *          half): a row may be actioned only when the role MAY act AND the row IS
 *          actionable. The row-actions cell gates off it (so terminal rows show no
 *          action — BR1 / AC-1), and the confirm handlers re-check it at confirm time so
 *          a row that turned terminal underneath dismisses the modal rather than mutating
 *          (AC-4). Reuse the existing ACTIONABLE_STATUS constant rather than inventing a
 *          second source of truth.
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/` Vite
 * alias does not resolve the parenthesised group segment, so the page is imported via a
 * relative path (helper modules under @/lib resolve normally). This mirrors Stories 1-2.
 *
 * These tests WILL FAIL until the helper and page changes are implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import TransactionsPage from '../../app/(app)/transactions/page';
import { isActionableTransactionStatus } from '@/lib/transactions/actionGating';

import { get } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { useToast } from '@/contexts/ToastContext';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockTransaction,
  createMockTransactionList,
} from '../helpers/epic-3-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page or the
// actionability predicate). The page fetches the full list via GET /v1/transactions;
// this story is pure presentation/guard logic with no new endpoints, so only `get` is
// exercised. `post` is mocked so the shared client module resolves cleanly.
vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;

vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// The page reads useToast for the Epic-1 toast system. This story raises no new toasts,
// but the hook must resolve for the page to render.
const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: vi.fn(() => ({
    toasts: [],
    showToast: mockShowToast,
    dismissToast: vi.fn(),
    clearAllToasts: vi.fn(),
  })),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
void useToast;

// The page reads the URL query params for the deep-link-in filters (Epic-3 Story 2).
// Default to an empty query string so the full list renders unfiltered.
const searchParamsRef = { current: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/transactions',
  useSearchParams: () => searchParamsRef.current,
}));

/** A loaded session for the given role (default Approver — the persona that acts). */
function sessionFor(roles: string[] = ['Approver']) {
  return {
    user: createMockAuthUser({ roles, name: 'Avery Pruver' }),
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  };
}

/**
 * A list spanning every status in the §11 vocabulary: one Imported row (actionable),
 * one Approved row, and one Rejected row (both terminal). This is the canonical mix the
 * terminal-state suppression (AC-1) and the terminal-state banner (AC-2) act on.
 */
function mixedStatusList() {
  return createMockTransactionList([
    createMockTransaction({
      Id: 7001,
      FileLogId: 1001,
      Reference: 'TXN-IMP-001',
      AccountNumber: '1001-2034-5567',
      Description: 'Imported payment awaiting review',
      Amount: 1500.5,
      TransactionType: 'Debit',
      Currency: 'ZAR',
      Status: 'Imported',
    }),
    createMockTransaction({
      Id: 7002,
      FileLogId: 1001,
      Reference: 'TXN-APR-002',
      AccountNumber: '1001-2034-9988',
      Description: 'Already approved salary deposit',
      Amount: 9900.1,
      TransactionType: 'Credit',
      Currency: 'ZAR',
      Status: 'Approved',
    }),
    createMockTransaction({
      Id: 7003,
      FileLogId: 1001,
      Reference: 'TXN-REJ-003',
      AccountNumber: '1001-2034-1122',
      Description: 'Already rejected duplicate',
      Amount: 480.25,
      TransactionType: 'Debit',
      Currency: 'ZAR',
      Status: 'Rejected',
    }),
  ]);
}

/**
 * A list where EVERY row is still Imported (no terminal rows). The terminal-state banner
 * must NOT appear here — there is nothing decided to explain.
 */
function allImportedList() {
  return createMockTransactionList([
    createMockTransaction({
      Id: 7101,
      FileLogId: 1001,
      Reference: 'TXN-IMP-101',
      AccountNumber: '1001-2034-5567',
      Description: 'First imported payment',
      Amount: 100.0,
      TransactionType: 'Debit',
      Currency: 'ZAR',
      Status: 'Imported',
    }),
    createMockTransaction({
      Id: 7102,
      FileLogId: 1001,
      Reference: 'TXN-IMP-102',
      AccountNumber: '1001-2034-9988',
      Description: 'Second imported payment',
      Amount: 200.0,
      TransactionType: 'Credit',
      Currency: 'ZAR',
      Status: 'Imported',
    }),
  ]);
}

/** Finds the table row whose Reference cell matches the given reference. */
function rowForReference(reference: string): HTMLElement {
  const cell = screen.getByText(reference);
  const row = cell.closest('tr');
  if (!row) {
    throw new Error(`No table row found for reference ${reference}`);
  }
  return row as HTMLElement;
}

describe('Epic 4, Story 3: Hiding actions once a transaction is decided', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // AC-3 — isActionableTransactionStatus: true ONLY for Imported (BR1)
  // ===================================================================

  // AC-3 / BR1 — the rule that decides whether the Approve/Reject actions are available.
  // Actions are available ONLY for the Imported status; both terminal states (Approved,
  // Rejected) are NON-actionable. This is the single source of truth the row-actions cell
  // gates off (AC-1) and the confirm-time concurrent guard re-checks (AC-4).
  it('isActionableTransactionStatus returns true only for Imported, false for Approved and Rejected', () => {
    // The only actionable state.
    expect(isActionableTransactionStatus('Imported')).toBe(true);

    // Both terminal states are non-actionable — actions are suppressed once decided.
    expect(isActionableTransactionStatus('Approved')).toBe(false);
    expect(isActionableTransactionStatus('Rejected')).toBe(false);
  });

  // AC-3 / BR1 — the rule is null-safe and does not actionably match unknown or
  // mis-cased values: a missing/empty/unrecognised status must NEVER be treated as
  // actionable (fail closed — a row whose state we cannot read is not re-actioned).
  it('isActionableTransactionStatus treats unknown, empty, mis-cased, and missing statuses as non-actionable', () => {
    expect(isActionableTransactionStatus('')).toBe(false);
    expect(isActionableTransactionStatus('Pending')).toBe(false);
    expect(isActionableTransactionStatus('Processing')).toBe(false);
    // Canonical §11 vocabulary is exact — a mis-cased value is not the actionable state.
    expect(isActionableTransactionStatus('imported')).toBe(false);
    expect(isActionableTransactionStatus('IMPORTED')).toBe(false);
    // Null-safe.
    expect(isActionableTransactionStatus(null)).toBe(false);
    expect(isActionableTransactionStatus(undefined)).toBe(false);
  });

  // ===================================================================
  // Integration render — terminal-state suppression of the row-actions
  // (underpins AC-1)
  // ===================================================================

  // AC-1 / BR1 — an Approver sees Approve AND Reject on the Imported row, and NEITHER on
  // the Approved row NOR the Rejected row (mutating actions are suppressed on terminal
  // records). Driven through the real page so the actionability predicate is proven WIRED
  // into the row-actions cell.
  it('shows Approve/Reject on the Imported row and hides them on Approved and Rejected rows for an Approver', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(mixedStatusList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // The Imported row offers both actions.
    const importedRow = rowForReference('TXN-IMP-001');
    expect(
      within(importedRow).getByRole('button', { name: /approve/i }),
    ).toBeInTheDocument();
    expect(
      within(importedRow).getByRole('button', { name: /reject/i }),
    ).toBeInTheDocument();

    // The Approved row (terminal) offers neither.
    const approvedRow = rowForReference('TXN-APR-002');
    expect(
      within(approvedRow).queryByRole('button', { name: /approve/i }),
    ).not.toBeInTheDocument();
    expect(
      within(approvedRow).queryByRole('button', { name: /reject/i }),
    ).not.toBeInTheDocument();

    // The Rejected row (terminal) offers neither.
    const rejectedRow = rowForReference('TXN-REJ-003');
    expect(
      within(rejectedRow).queryByRole('button', { name: /approve/i }),
    ).not.toBeInTheDocument();
    expect(
      within(rejectedRow).queryByRole('button', { name: /reject/i }),
    ).not.toBeInTheDocument();
  });

  // ===================================================================
  // Integration render — terminal-state banner appears / does not appear
  // based on the visible rows (underpins AC-2)
  // ===================================================================

  // AC-2 / BR1 — when the visible rows include at least one terminal (Approved/Rejected)
  // row, a top-of-page banner explains that decided transactions can no longer be
  // actioned. The banner reuses the alert primitive (role="alert").
  it('shows a top-of-page terminal-state banner when visible rows include a decided transaction', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(mixedStatusList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // A banner explaining that decided transactions are read-only / can no longer be
    // actioned is present at the top of the page.
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(/can no longer be actioned/i);
  });

  // AC-2 / BR1 — when every visible row is still Imported (nothing decided), the
  // terminal-state banner is ABSENT — there is no read-only state to explain.
  it('does not show the terminal-state banner when every visible row is still Imported', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(allImportedList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-101')).toBeInTheDocument();
    });

    // No terminal-state banner — the message about decided transactions is not shown.
    expect(
      screen.queryByText(/can no longer be actioned/i),
    ).not.toBeInTheDocument();
  });

  // ===================================================================
  // Accessibility — the transactions surface with the terminal-state banner present
  // ===================================================================

  // The Approver view, with the terminal-state banner rendered above the table and the
  // row-actions present on the Imported row, has no accessibility violations.
  it('has no accessibility violations with the terminal-state banner rendered', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(mixedStatusList());

    const { container } = render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
