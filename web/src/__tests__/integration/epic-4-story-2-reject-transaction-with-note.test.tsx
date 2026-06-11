/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing — adds an Approver-only Reject row-action ALONGSIDE
 *   the Story-1 Approve action. The Story-1 gated row-actions cell, the
 *   canActionTransaction predicate (@/lib/transactions/actionGating), the alert-dialog
 *   primitive, useToast, and the TransactionRow are REUSED — the fetch -> filter ->
 *   sort -> paginate pipeline and the row-actions cell are NOT rebuilt; this story
 *   adds a single Reject affordance, a modal carrying a MANDATORY Rejection Note, the
 *   reject API call, an optimistic row -> Rejected transition, and a success/error toast.
 *
 * Epic 4, Story 2: Rejecting a transaction with a note (R10 / BR2 / BR3 / BR9).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (playwright): an Approver sees Reject on every Imported row; an Importer
 *     sees none — proven end-to-end in the companion spec; the predicate that gates
 *     it is asserted directly here and the WIRING is proven in the render below.
 *   - AC-2 (playwright): Reject opens a box naming the Reference with a rejection-note
 *     field; submit stays disabled until a note is entered — the disabled-until-note
 *     wiring is asserted in the render below; the browser-observable modal mechanics
 *     are proven in Playwright.
 *   - AC-3 (playwright): empty note on blur, or empty submit, shows a note-required
 *     message; entering a note clears it — the on-blur required message is asserted in
 *     the render below.
 *   - AC-4 (playwright): submitting with a note flips the row to Rejected immediately
 *     + notification — the call shape + optimistic flip + success toast are proven WIRED
 *     in the render below.
 *   - AC-5 (vitest): the note-required rule treats whitespace-only input as empty —
 *     covered THOROUGHLY by the isRejectionNoteValid / normaliseRejectionNote unit
 *     blocks below.
 *   - AC-6 (playwright): if the reject request fails, the row stays Imported + error
 *     notification — proven WIRED in the render below.
 *
 * What this Vitest file covers — AC-5 thoroughly, plus the unit/integration logic that
 * UNDERPINS the Playwright AC-1 / AC-2 / AC-3 / AC-4 / AC-6 flows and is best asserted
 * in jsdom (the pure validation rule, the API-call shape, and a focused page render
 * that proves the mandatory-note gate + the reject call + the optimistic transition +
 * the toasts are WIRED — without depending on browser-only focus/animation behaviour):
 *   - isRejectionNoteValid(note): false for empty / whitespace-only (BR2 / R10 —
 *     whitespace-only counts as empty); true for any note with non-whitespace content.
 *     null-safe (a missing note is invalid).
 *   - normaliseRejectionNote(note): trims surrounding whitespace before submit, so the
 *     persisted UserNote carries no leading/trailing padding.
 *   - rejectTransaction(transactionId, userNote, lastChangedUser): POSTs to
 *     /v1/transactions/reject?TransactionId=<id> with the TransactionId BAKED INTO the
 *     endpoint string (post() exposes no params for this contract — mirrors the Story-1
 *     approveTransaction convention), the body { UserNote }, the LastChangedUser audit
 *     header as the 3rd arg, and requiresAuth.
 *   - the page render: an Approver sees a Reject control on an Imported row; an Importer
 *     sees NONE (hidden, not disabled — §2); Reject opens a modal NAMING the Reference
 *     with a note field whose submit is DISABLED until a non-empty note is entered; an
 *     empty/whitespace note on blur shows a required message; submitting with a note
 *     calls rejectTransaction with the right id + (trimmed) note, optimistically flips
 *     the row to Rejected (R10) and raises a success toast; a rejected reject promise
 *     leaves the row Imported and raises an error toast (AC-6 — no silent failure).
 *
 * NOTE on the modal: the default-focus-on-Cancel (BR3) and the destructive styling of
 * the submit control are browser-observable concerns proven in Playwright. In jsdom we
 * assert the modal OPENS, NAMES the Reference, gates submit on a non-empty note, and
 * that submit drives the correct API call + state — never the focus ring or the Radix
 * animation internals (asserting those here would be brittle library-internal tests).
 *
 * Source of truth: generated-docs/specs/project-brief.md + documentation/transactions-api.yaml.
 *   - R10 (§7): an Approver may reject an Imported transaction by submitting a non-empty
 *     Rejection Note (stored as UserNote), moving Status to Rejected.
 *   - BR2 (§8, blocker): a non-empty Rejection Note must be provided; submit is disabled
 *     until a note is entered; the note validates on blur and on submit.
 *   - BR3 (§8, blocker): a confirmation modal naming the transaction Reference is shown
 *     before the status change; default focus on Cancel.
 *   - BR9 (§8, blocker): Reject is Approver-only; Importers see the table read-only with
 *     NO action controls.
 *   - §2: denied actions are HIDDEN in the UI, not rendered disabled.
 *   - POST /v1/transactions/reject (transactions-api.yaml): TransactionId is a REQUIRED
 *     query param (integer); LastChangedUser a REQUIRED header; the request body is
 *     TransactionRejectWrite { UserNote: string }; returns a DefaultResponse on 200.
 *
 * EXTRACTED HELPERS the developer must create/extend (the failing imports below):
 *
 *   - web/src/lib/transactions/rejectionNote.ts  (NEW)
 *       -> isRejectionNoteValid(note: string | null | undefined): boolean — false for
 *          empty / whitespace-only / null / undefined; true for any note with
 *          non-whitespace content (BR2 / R10 — the note-required rule the modal gates
 *          submit off, validated on blur and on submit).
 *       -> normaliseRejectionNote(note: string): string — trims surrounding whitespace
 *          so the persisted UserNote carries no leading/trailing padding before submit.
 *
 *   - web/src/lib/api/transactions.ts  (EXTEND — approveTransaction already present)
 *       -> rejectTransaction(transactionId: number, userNote: string,
 *          lastChangedUser: string): Promise<DefaultResponse> — calls
 *          post('/v1/transactions/reject?TransactionId=<id>', { UserNote: userNote },
 *          lastChangedUser, { requiresAuth: true }). The TransactionId is BAKED INTO the
 *          endpoint string (post() has no params for this contract — mirrors the Story-1
 *          approveTransaction convention); the body carries UserNote; the acting user is
 *          passed as the 3rd arg (mapped to the LastChangedUser audit header).
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/` Vite
 * alias does not resolve the parenthesised group segment, so the page is imported via a
 * relative path (helper modules under @/lib resolve normally). This mirrors Story 1.
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
import {
  isRejectionNoteValid,
  normaliseRejectionNote,
} from '@/lib/transactions/rejectionNote';
import { rejectTransaction } from '@/lib/api/transactions';

import { get, post } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { useToast } from '@/contexts/ToastContext';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockTransaction,
  createMockTransactionList,
} from '../helpers/epic-3-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page, the
// validation rule, the rejectTransaction builder). The page fetches the full list via
// GET /v1/transactions and rejects via POST /v1/transactions/reject; we drive those two
// boundaries here.
vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;
const mockPost = post as ReturnType<typeof vi.fn>;

vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// The page raises toasts through the Epic-1 toast system. Mock useToast so the raised
// toasts are observable as calls (the container's own rendering is proven by Epic-1
// Story-4; here we assert the page RAISES the right toast). Mirrors Story 1's setup.
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

/** A loaded session for the given role (default Approver — the reject persona). */
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
 * A small, explicit two-row list: one Imported row (the reject target) and one Approved
 * row (already-terminal — must NOT offer Reject). Kept minimal so the reject flow is
 * unambiguous and the row whose status flips is identifiable.
 */
function transactionsList() {
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
  ]);
}

/** The DefaultResponse the reject endpoint returns on a successful 200. */
function rejectOk() {
  return {
    Id: 7001,
    MessageType: 'Success',
    Messages: ['Transaction rejected'],
  };
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

/**
 * Opens the Reject modal for the given Imported row and returns the dialog element.
 * Reuses the Story-1 alert-dialog primitive (role="alertdialog").
 */
async function openRejectModal(
  user: ReturnType<typeof userEvent.setup>,
  reference: string,
): Promise<HTMLElement> {
  const row = rowForReference(reference);
  await user.click(within(row).getByRole('button', { name: /reject/i }));
  return screen.findByRole('alertdialog');
}

describe('Epic 4, Story 2: Rejecting a transaction with a note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // AC-5 — isRejectionNoteValid: whitespace-only counts as empty (BR2 / R10)
  // ===================================================================

  // AC-5 / BR2 / R10 — the note-required rule. A note is valid only when it carries
  // non-whitespace content; an empty string, a whitespace-only string (spaces, tabs,
  // newlines), or a missing value all count as EMPTY (invalid). This is the rule the
  // modal gates submit off, validated on blur and on submit.
  it('isRejectionNoteValid treats empty and whitespace-only notes as invalid (null-safe)', () => {
    // A note with real content is valid.
    expect(
      isRejectionNoteValid('Amount does not match supporting document'),
    ).toBe(true);
    expect(isRejectionNoteValid('x')).toBe(true);
    // Content surrounded by whitespace is still valid (there is real content).
    expect(isRejectionNoteValid('  has content  ')).toBe(true);

    // Empty string is invalid.
    expect(isRejectionNoteValid('')).toBe(false);

    // Whitespace-only — spaces, tabs, newlines, mixed — all count as EMPTY.
    expect(isRejectionNoteValid(' ')).toBe(false);
    expect(isRejectionNoteValid('     ')).toBe(false);
    expect(isRejectionNoteValid('\t')).toBe(false);
    expect(isRejectionNoteValid('\n')).toBe(false);
    expect(isRejectionNoteValid('  \t \n  ')).toBe(false);

    // Null-safe — a missing note is invalid.
    expect(isRejectionNoteValid(null)).toBe(false);
    expect(isRejectionNoteValid(undefined)).toBe(false);
  });

  // AC-5 / R10 — the note is trimmed of surrounding whitespace before submit, so the
  // persisted UserNote carries no leading/trailing padding. Interior whitespace is
  // preserved (the operator's note text is otherwise untouched).
  it('normaliseRejectionNote trims surrounding whitespace and preserves interior text', () => {
    expect(normaliseRejectionNote('  duplicate entry  ')).toBe(
      'duplicate entry',
    );
    expect(normaliseRejectionNote('\n\tneeds review\t\n')).toBe('needs review');
    // Interior whitespace is preserved.
    expect(normaliseRejectionNote('  wrong  amount  ')).toBe('wrong  amount');
    // An already-clean note is unchanged.
    expect(normaliseRejectionNote('clean note')).toBe('clean note');
  });

  // ===================================================================
  // AC-4 / AC-6 underpinning — rejectTransaction call shape
  // ===================================================================

  // R10 / BR2 — rejectTransaction POSTs to the reject endpoint with the TransactionId
  // BAKED INTO the endpoint query string (post() has no params for this contract —
  // mirrors approveTransaction), the body { UserNote }, the LastChangedUser audit header
  // as the 3rd arg, and requiresAuth. Returns the resolved DefaultResponse to the caller.
  it('rejectTransaction POSTs to the reject endpoint with the id in the query string, the UserNote body + audit header', async () => {
    mockPost.mockResolvedValue(rejectOk());

    const result = await rejectTransaction(
      7001,
      'Amount does not match supporting document',
      'Avery Pruver',
    );

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/transactions/reject?TransactionId=7001',
      { UserNote: 'Amount does not match supporting document' },
      'Avery Pruver',
      { requiresAuth: true },
    );
    expect(result).toEqual(rejectOk());
  });

  // ===================================================================
  // Integration render — Reject visible for Approver / hidden for Importer
  // (underpins AC-1)
  // ===================================================================

  // AC-1 / BR9 / §2 — an Approver sees a Reject control on the Imported row, and NOT on
  // the already-Approved row (reject is offered only on Imported). Driven through the
  // real page so the canActionTransaction gate (reused from Story 1) is proven WIRED for
  // the Reject action too.
  it('shows a Reject action on Imported rows for an Approver (not on Approved rows)', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // The Imported row offers a Reject control.
    const importedRow = rowForReference('TXN-IMP-001');
    expect(
      within(importedRow).getByRole('button', { name: /reject/i }),
    ).toBeInTheDocument();

    // The already-Approved row offers NO Reject control (terminal status).
    const approvedRow = rowForReference('TXN-APR-002');
    expect(
      within(approvedRow).queryByRole('button', { name: /reject/i }),
    ).not.toBeInTheDocument();
  });

  // AC-1 / BR9 / §2 — an Importer sees NO Reject control on ANY row (hidden, not
  // disabled — denied actions are HIDDEN per §2). The Importer still sees the read-only
  // table.
  it('hides the Reject action entirely from an Importer on every row', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Importer']));
    mockGet.mockResolvedValue(transactionsList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // No Reject control anywhere — neither enabled nor disabled.
    expect(
      screen.queryByRole('button', { name: /reject/i }),
    ).not.toBeInTheDocument();
  });

  // ===================================================================
  // Integration render — modal names the Reference + carries a note field, submit
  // gated until a non-empty note (underpins AC-2)
  // ===================================================================

  // AC-2 / BR2 / BR3 — clicking Reject opens a modal that NAMES the transaction
  // Reference (so the Approver rejects the right subject — BR3) and carries a Rejection
  // Note field; the submit control is DISABLED until a non-empty note is entered, then
  // ENABLED once the note has content (BR2). The note field is the labelled
  // multi-line input.
  it('opens a modal naming the reference with a note field whose submit is gated until a non-empty note', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    const dialog = await openRejectModal(user, 'TXN-IMP-001');

    // The modal names the subject Reference.
    expect(within(dialog).getByText(/TXN-IMP-001/)).toBeInTheDocument();

    // It carries a labelled Rejection Note field.
    const noteField = within(dialog).getByLabelText(/rejection note/i);
    expect(noteField).toBeInTheDocument();

    // Submit is DISABLED until a non-empty note is entered (BR2).
    const submit = within(dialog).getByRole('button', { name: /^reject$/i });
    expect(submit).toBeDisabled();

    // Entering a non-empty note ENABLES submit.
    await user.type(noteField, 'Amount does not match supporting document');
    expect(submit).toBeEnabled();
  });

  // ===================================================================
  // Integration render — empty/whitespace note on blur shows a required message
  // (underpins AC-3)
  // ===================================================================

  // AC-3 / BR2 — when the note field is blurred while empty (or whitespace-only — the
  // isRejectionNoteValid rule), a note-required message is shown; entering real content
  // and the message clears. Validation fires on blur (BR2: validates on blur and submit).
  it('shows a note-required message when the note is blurred empty/whitespace, and clears it once content is entered', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    const dialog = await openRejectModal(user, 'TXN-IMP-001');
    const noteField = within(dialog).getByLabelText(/rejection note/i);

    // Type only whitespace, then blur — whitespace-only counts as empty (BR2).
    await user.type(noteField, '   ');
    await user.tab();

    await waitFor(() => {
      expect(within(dialog).getByText(/note is required/i)).toBeInTheDocument();
    });

    // Entering real content clears the required message.
    await user.type(noteField, 'Amount does not match supporting document');
    await waitFor(() => {
      expect(
        within(dialog).queryByText(/note is required/i),
      ).not.toBeInTheDocument();
    });
  });

  // ===================================================================
  // Integration render — submit performs the reject + optimistic flip + success toast
  // (underpins AC-4)
  // ===================================================================

  // AC-4 / R10 — submitting with a note calls rejectTransaction with the subject id and
  // the (trimmed) note (via the client POST), optimistically transitions that row's
  // Status to Rejected, and raises a SUCCESS toast. The acting user's name flows into
  // the LastChangedUser audit header.
  it('rejects the row on submit: calls the API with the id + note, flips the row to Rejected, raises a success toast', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());
    mockPost.mockResolvedValue(rejectOk());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // The subject row is Imported before rejection.
    const importedRow = rowForReference('TXN-IMP-001');
    expect(within(importedRow).getByText('Imported')).toBeInTheDocument();

    // Reject -> enter note -> submit.
    const dialog = await openRejectModal(user, 'TXN-IMP-001');
    await user.type(
      within(dialog).getByLabelText(/rejection note/i),
      'Amount does not match supporting document',
    );
    await user.click(within(dialog).getByRole('button', { name: /^reject$/i }));

    // The reject API is called for the subject id, carrying the (trimmed) UserNote body
    // and the acting user in the LastChangedUser audit header (3rd post arg) with
    // requiresAuth.
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/transactions/reject?TransactionId=7001',
        { UserNote: 'Amount does not match supporting document' },
        'Avery Pruver',
        { requiresAuth: true },
      );
    });

    // The row optimistically flips to Rejected (R10) and the Reject control on it is
    // gone (terminal status), and a success toast is raised.
    await waitFor(() => {
      const updatedRow = rowForReference('TXN-IMP-001');
      expect(within(updatedRow).getByText('Rejected')).toBeInTheDocument();
      expect(
        within(updatedRow).queryByRole('button', { name: /reject/i }),
      ).not.toBeInTheDocument();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  // ===================================================================
  // Integration render — failed reject leaves the row Imported + error toast
  // (underpins AC-6 — no silent failure)
  // ===================================================================

  // AC-6 — when the reject request REJECTS, the row stays Imported (no optimistic
  // commit) and an ERROR toast is raised; the failure is never swallowed silently.
  it('keeps the row Imported and raises an error toast when the reject request fails', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());
    mockPost.mockRejectedValue(new Error('Reject failed'));

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    const dialog = await openRejectModal(user, 'TXN-IMP-001');
    await user.type(
      within(dialog).getByLabelText(/rejection note/i),
      'Amount does not match supporting document',
    );
    await user.click(within(dialog).getByRole('button', { name: /^reject$/i }));

    // An error toast is raised (the failure is surfaced, not swallowed).
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });

    // The row remains Imported and still offers Reject (no optimistic commit on a
    // rejected request).
    const unchangedRow = rowForReference('TXN-IMP-001');
    expect(within(unchangedRow).getByText('Imported')).toBeInTheDocument();
    expect(
      within(unchangedRow).getByRole('button', { name: /reject/i }),
    ).toBeInTheDocument();
  });

  // ===================================================================
  // Accessibility — the transactions surface with the Reject action present
  // ===================================================================

  // The Approver view (with the row-level Reject controls rendered) has no accessibility
  // violations.
  it('has no accessibility violations with the Reject controls rendered', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());

    const { container } = render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
