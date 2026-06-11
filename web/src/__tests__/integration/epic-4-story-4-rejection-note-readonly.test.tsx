/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing — LAYERS a read-only display of the stored Rejection
 *   Note (UserNote) onto the EXISTING Transactions table for Rejected rows. The Epic-3
 *   fetch → filter → sort → paginate pipeline, the TransactionRow mapping, the
 *   Story-1/2/3 row-actions/banner, and the toTransactionRow `userNote` field (added in
 *   Story 2) are REUSED — nothing in that pipeline is rebuilt. No mutation, no new
 *   endpoint: read-only presentation only.
 *
 * Epic 4, Story 4: Reading why a transaction was rejected (BR8).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md). All three ACs
 * are tagged `playwright` (the read-only note affordance is proven browser-observable in
 * the companion spec). This Vitest file owns the jsdom-assertable integration logic that
 * UNDERPINS those Playwright ACs, plus the load-bearing pure-mapping concern:
 *   - AC-1 (playwright): a Rejected transaction displays its rejection note in read-only
 *     form on the table; the note cannot be edited. UNDERPINNED here by the page render
 *     showing a Rejected row's note text AND the ABSENCE of any editable control (no
 *     textbox) bound to it.
 *   - AC-2 (playwright): Imported and Approved transactions show no rejection note.
 *     UNDERPINNED here by the page render asserting the (non-empty) UserNote carried on
 *     an Imported and an Approved row is NOT surfaced as a rejection-note affordance.
 *   - AC-3 (playwright): both an Approver and an Importer can read a Rejected
 *     transaction's note. UNDERPINNED here by rendering the page for an Importer session
 *     and asserting the Rejected row's note is still readable (the read-only note is
 *     role-independent — it is not gated by canActionTransaction).
 *
 * LOAD-BEARING mapping concern (CRITICAL — fresh-load, not only Story-2's optimistic
 * update): the rejection note must come from the API on a fresh GET /v1/transactions,
 * NOT only from Story 2's in-session optimistic flip. The GET response carries a UserNote
 * field per transaction; toTransactionRow must map API UserNote -> row.userNote so a
 * freshly-loaded Rejected transaction shows its note. The existing Story-1 mapping test
 * does NOT assert this field, so a focused unit block proves it here (no duplication).
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - BR8: the stored Rejection Note (UserNote) is displayed read-only for Rejected
 *     transactions, visible to both the Approver and the Importer roles.
 *   - §11: the Transaction status vocabulary is Imported / Approved / Rejected.
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/` Vite
 * alias does not resolve the parenthesised group segment, so the page is imported via a
 * relative path (helper modules under @/lib resolve normally). This mirrors Stories 1-3.
 *
 * These tests WILL FAIL until the read-only note display is implemented (TDD red): the
 * page currently renders `row.userNote` nowhere.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to surface the note until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import TransactionsPage from '../../app/(app)/transactions/page';
import { toTransactionRow } from '@/lib/transactions/mapping';

import { get } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { useToast } from '@/contexts/ToastContext';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockTransaction,
  createMockTransactionList,
} from '../helpers/epic-3-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page or the
// pure mapping). The page fetches the full list via getTransactions -> get
// /v1/transactions (the real api/transactions module is exercised; only the client is
// mocked). This story is pure read-only presentation with no new endpoints, so `get`
// carries the loaded note. `post` is mocked so the shared client module resolves cleanly.
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

/** A loaded session for the given roles (default Approver). */
function sessionFor(roles: string[] = ['Approver']) {
  return {
    user: createMockAuthUser({ roles, name: 'Avery Pruver' }),
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  };
}

// The note recorded against the Rejected row. Chosen to be a distinctive phrase so it is
// unambiguously the rejection note (not some other column's text) when asserted.
const REJECTION_NOTE = 'Amount does not match the supporting invoice document';

// A note value carried on the NON-rejected rows. These rows must NOT surface a rejection
// note even when the backend supplies a UserNote — the note is a Rejected-only affordance
// (BR8). Distinctive phrases so a leak would be caught.
const APPROVED_NOTE = 'Approver back-office reconciliation memo';
const IMPORTED_NOTE = 'Imported-row stray note that must never be shown';

/**
 * A list spanning the §11 vocabulary, every row carrying a (non-empty) UserNote from the
 * API: one Imported row, one Approved row, and one Rejected row. ONLY the Rejected row's
 * note must be surfaced read-only (BR8). The non-rejected notes are present in the data
 * so the test proves the display is gated by Rejected STATUS, not merely by note presence.
 */
function mixedStatusListWithNotes() {
  return createMockTransactionList([
    createMockTransaction({
      Id: 8001,
      FileLogId: 1001,
      Reference: 'TXN-IMP-001',
      AccountNumber: '1001-2034-5567',
      Description: 'Imported payment awaiting review',
      Amount: 1500.5,
      TransactionType: 'Debit',
      Currency: 'ZAR',
      Status: 'Imported',
      UserNote: IMPORTED_NOTE,
    }),
    createMockTransaction({
      Id: 8002,
      FileLogId: 1001,
      Reference: 'TXN-APR-002',
      AccountNumber: '1001-2034-9988',
      Description: 'Already approved salary deposit',
      Amount: 9900.1,
      TransactionType: 'Credit',
      Currency: 'ZAR',
      Status: 'Approved',
      UserNote: APPROVED_NOTE,
    }),
    createMockTransaction({
      Id: 8003,
      FileLogId: 1001,
      Reference: 'TXN-REJ-003',
      AccountNumber: '1001-2034-1122',
      Description: 'Already rejected duplicate',
      Amount: 480.25,
      TransactionType: 'Debit',
      Currency: 'ZAR',
      Status: 'Rejected',
      UserNote: REJECTION_NOTE,
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

describe('Epic 4, Story 4: Reading why a transaction was rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // Unit: API UserNote -> row.userNote mapping (LOAD-BEARING fresh-load — BR8)
  // ===================================================================

  // BR8 — the rejection note shown on a freshly-loaded Rejected row comes from the API,
  // not only from Story-2's in-session optimistic flip. toTransactionRow must carry the
  // GET response's UserNote onto row.userNote so a fresh load surfaces the stored note;
  // and a missing UserNote must default to an empty string (never undefined) so callers
  // can render it safely. The existing Story-1 mapping test does not assert this field.
  it('maps the API UserNote onto row.userNote (and defaults a missing note to empty string)', () => {
    const rejected = toTransactionRow(
      createMockTransaction({
        Id: 8003,
        Status: 'Rejected',
        UserNote: REJECTION_NOTE,
      }),
    );
    expect(rejected.userNote).toBe(REJECTION_NOTE);

    // A response with no UserNote yields an empty string, never undefined.
    const noNote = toTransactionRow(
      createMockTransaction({ Id: 8004, Status: 'Imported', UserNote: '' }),
    );
    expect(noNote.userNote).toBe('');
  });

  // ===================================================================
  // Integration render — Rejected row shows its note READ-ONLY (underpins AC-1)
  // ===================================================================

  // AC-1 / BR8 — a Rejected transaction surfaces its stored rejection note on the table,
  // and the note is READ-ONLY: the note text is present, but there is NO editable control
  // (no textbox / no editable form field) bound to it on the Rejected row. Driven through
  // the real page so the note loaded from the API (not optimistically) is proven rendered.
  it('shows the Rejected row rejection note as read-only text with no editable control', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(mixedStatusListWithNotes());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-REJ-003')).toBeInTheDocument();
    });

    // The stored note from the API is visible on the page.
    expect(screen.getByText(REJECTION_NOTE)).toBeInTheDocument();

    // Read-only: the note is NOT presented in an editable form control. There is no
    // textbox carrying the note value anywhere on the surface (the only editable controls
    // are the filter inputs, none of which hold the note).
    screen.queryAllByRole('textbox').forEach((field) => {
      expect((field as HTMLInputElement | HTMLTextAreaElement).value).not.toBe(
        REJECTION_NOTE,
      );
    });
    // Nor a Story-2 style rejection-note textarea editing this value.
    expect(screen.queryByDisplayValue(REJECTION_NOTE)).not.toBeInTheDocument();
  });

  // ===================================================================
  // Integration render — non-rejected rows show NO note (underpins AC-2)
  // ===================================================================

  // AC-2 / BR8 — Imported and Approved transactions show no rejection note, EVEN when the
  // backend supplied a UserNote on those rows. The read-only note affordance is gated by
  // the Rejected status, not merely by note presence — so a stray note on a non-rejected
  // row is never surfaced.
  it('does not show any rejection note on Imported or Approved rows', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(mixedStatusListWithNotes());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // The Rejected row's note IS shown (control for the assertions below).
    expect(screen.getByText(REJECTION_NOTE)).toBeInTheDocument();

    // Neither non-rejected row surfaces its stray note text anywhere on the page.
    expect(screen.queryByText(IMPORTED_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText(APPROVED_NOTE)).not.toBeInTheDocument();

    // And the note is not present within those rows' own markup.
    const importedRow = rowForReference('TXN-IMP-001');
    const approvedRow = rowForReference('TXN-APR-002');
    expect(
      within(importedRow).queryByText(IMPORTED_NOTE),
    ).not.toBeInTheDocument();
    expect(
      within(approvedRow).queryByText(APPROVED_NOTE),
    ).not.toBeInTheDocument();
  });

  // ===================================================================
  // Integration render — the note is role-independent (underpins AC-3)
  // ===================================================================

  // AC-3 / BR8 — both an Approver and an Importer can read a Rejected transaction's note.
  // The read-only note is NOT gated by canActionTransaction (which hides the Approve/
  // Reject ACTIONS for an Importer): an Importer session — which sees no row actions —
  // still sees the Rejected row's rejection note.
  it('shows the Rejected row note to an Importer (read-only note is not role-gated)', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Importer']));
    mockGet.mockResolvedValue(mixedStatusListWithNotes());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-REJ-003')).toBeInTheDocument();
    });

    // The Importer sees no row actions (Approve/Reject are Approver-only, hidden)...
    const rejectedRow = rowForReference('TXN-REJ-003');
    expect(
      within(rejectedRow).queryByRole('button', { name: /approve/i }),
    ).not.toBeInTheDocument();
    expect(
      within(rejectedRow).queryByRole('button', { name: /reject/i }),
    ).not.toBeInTheDocument();

    // ...yet the rejection note is still readable to the Importer.
    expect(screen.getByText(REJECTION_NOTE)).toBeInTheDocument();
  });

  // ===================================================================
  // Accessibility — the transactions surface with the read-only note rendered
  // ===================================================================

  // The Approver view, with the Rejected row's read-only rejection note rendered in the
  // table, has no accessibility violations.
  it('has no accessibility violations with the read-only rejection note rendered', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(mixedStatusListWithNotes());

    const { container } = render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText(REJECTION_NOTE)).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
