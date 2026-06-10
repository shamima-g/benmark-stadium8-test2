/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing — LAYER an Approver-only Approve row-action onto
 *   the Epic-3 read-only transactions table. The fetch -> filter -> sort ->
 *   paginate pipeline, the filter bar, the chips, the pagination, the zero-states,
 *   and the Approver-only Export control are NOT rebuilt; this story adds a single
 *   row-level Approve affordance (with a confirmation dialog), the approve API
 *   call, an optimistic row -> Approved transition, and a success/error toast.
 *
 * Epic 4, Story 1: Approving an imported transaction (R9 / BR1 / BR3 / BR9).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (playwright): an Approver sees Approve on every Imported row; an Importer
 *     sees no action controls on any row.
 *   - AC-2 (playwright): Approve opens a confirmation naming the Reference, focus
 *     defaulting to Cancel, the confirm styled as a serious/destructive action
 *     (BR3) — the focus-default + destructive-styling are browser-observable and
 *     proven end-to-end in the companion spec.
 *   - AC-3 (playwright): confirming flips that row to Approved immediately + a
 *     success notification; cancelling leaves it unchanged.
 *   - AC-4 (vitest): the role check grants the action ONLY to an Approver, never to
 *     an Importer or an empty role set — covered directly by the
 *     canActionTransaction unit blocks below.
 *   - AC-5 (playwright): if the approve request fails, the row stays Imported and an
 *     error notification appears (no silent failure).
 *
 * What this Vitest file covers — AC-4 thoroughly, plus the unit/integration logic
 * that UNDERPINS the Playwright AC-1 / AC-2 / AC-3 / AC-5 flows and is best asserted
 * in jsdom (the pure predicate, the API-call shape, and a focused page render that
 * proves the predicate + the approve call + the optimistic transition + the toasts
 * are WIRED — without depending on browser-only focus/animation behaviour):
 *   - canActionTransaction(roles): Approve is Approver-only (BR9 read-only;
 *     Importers never see it) — the predicate the page gates row-action VISIBILITY
 *     off. Mirrors the @/lib/transactions/exportGating convention (case-insensitive
 *     role-name match, null-safe).
 *   - approveTransaction(transactionId, lastChangedUser): POSTs to
 *     /v1/transactions/approve?TransactionId=<id> with the TransactionId baked into
 *     the endpoint string (post() exposes no params for this contract — mirrors the
 *     Epic-2 Story-4 cancelFile convention), carrying the LastChangedUser audit
 *     header and requiresAuth.
 *   - the page render: an Approver sees an Approve control on an Imported row;
 *     an Importer sees NONE (hidden, not disabled — §2); confirming the dialog calls
 *     approveTransaction with the right id, optimistically flips the row to Approved
 *     (BR1 / R9), and raises a success toast; a rejected approve promise leaves the
 *     row Imported and raises an error toast (AC-5 — no silent failure).
 *
 * NOTE on the confirmation dialog: the focus-default-on-Cancel and the destructive
 * styling of the confirm control (AC-2) are browser-observable concerns proven in
 * Playwright. In jsdom we assert the dialog OPENS and NAMES the Reference, and that
 * confirm/cancel drive the correct API call + state — never the focus ring or the
 * Radix animation internals (asserting those here would be brittle library-internal
 * tests).
 *
 * Source of truth: generated-docs/specs/project-brief.md + documentation/transactions-api.yaml.
 *   - R9 (§7): an Approver may approve an Imported transaction, moving it to Approved.
 *   - BR1 (§8): a transaction's Status moves Imported -> Approved on approval.
 *   - BR3 (§8): a destructive/serious action requires a confirmation naming the
 *     subject (here the transaction Reference) before it is performed.
 *   - BR9 (§8, blocker): Importers see the Transactions table read-only with NO
 *     action controls — Approve is Approver-only.
 *   - §2: denied actions are HIDDEN in the UI, not rendered disabled (so an Importer
 *     sees NO Approve control at all).
 *   - POST /v1/transactions/approve (transactions-api.yaml): TransactionId is a
 *     REQUIRED query param (integer), LastChangedUser a REQUIRED header; returns a
 *     DefaultResponse on 200.
 *
 * EXTRACTED HELPERS the developer must create (the failing imports below):
 *
 *   - web/src/lib/transactions/actionGating.ts
 *       -> canActionTransaction(roles: string[]): boolean — Approver-only (BR9);
 *          MIRRORS @/lib/transactions/exportGating.canExportTransactions
 *          (case-insensitive role-name match, null-safe — a missing/empty role set
 *          is never granted).
 *
 *   - web/src/lib/api/transactions.ts
 *       -> approveTransaction(transactionId: number, lastChangedUser: string):
 *          Promise<DefaultResponse> — calls
 *          post('/v1/transactions/approve?TransactionId=<id>', undefined,
 *          lastChangedUser, { requiresAuth: true }). The TransactionId is BAKED INTO
 *          the endpoint string (post() has no params for this contract — mirrors the
 *          Epic-2 Story-4 cancelFile convention in @/lib/files/lifecycleRequests).
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
import { canActionTransaction } from '@/lib/transactions/actionGating';
import { approveTransaction } from '@/lib/api/transactions';

import { get, post } from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { useToast } from '@/contexts/ToastContext';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockTransaction,
  createMockTransactionList,
} from '../helpers/epic-3-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the gating predicate, the approveTransaction builder). The page fetches the full
// list via GET /v1/transactions (no server-side params — the approved spec gap) and
// approves via POST /v1/transactions/approve; we drive those two boundaries here.
vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));
const mockGet = get as ReturnType<typeof vi.fn>;
const mockPost = post as ReturnType<typeof vi.fn>;

vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// The page is the first consumer of the Epic-1 toast system. Mock useToast so the
// raised toasts are observable as calls (the toast container's own rendering is
// proven by Epic-1 Story-4; here we assert the page RAISES the right toast). The
// ToastProvider passthrough keeps any descendant that calls useToast from throwing.
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

/** A loaded session for the given role (default Approver — the approve persona). */
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
 * A small, explicit two-row list: one Imported row (the approve target) and one
 * Approved row (already-terminal — must NOT offer Approve). Kept minimal so the
 * approve flow is unambiguous and the row whose status flips is identifiable.
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

/** The DefaultResponse the approve endpoint returns on a successful 200. */
function approveOk() {
  return {
    Id: 7001,
    MessageType: 'Success',
    Messages: ['Transaction approved'],
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

describe('Epic 4, Story 1: Approving an imported transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // AC-4 — canActionTransaction: Approver-only role predicate
  // ===================================================================

  // AC-4 / BR9 — Approve is Approver-only. An Approver is granted; an Importer is
  // NOT (so the page hides the row action entirely — §2). The match mirrors the
  // established exportGating convention: case-insensitive role-name match, null-safe
  // (a missing/empty role set is never granted).
  it('canActionTransaction grants Approver only (Importer denied, null-safe, case-insensitive)', () => {
    // Approver granted, in any casing.
    expect(canActionTransaction(['Approver'])).toBe(true);
    expect(canActionTransaction(['approver'])).toBe(true);
    expect(canActionTransaction(['APPROVER'])).toBe(true);
    expect(canActionTransaction(['  Approver  '])).toBe(true);

    // A user holding both roles can still action (Approver present).
    expect(canActionTransaction(['Importer', 'Approver'])).toBe(true);

    // Importer-only is denied.
    expect(canActionTransaction(['Importer'])).toBe(false);

    // Empty / null-safe — never granted.
    expect(canActionTransaction([])).toBe(false);
    expect(canActionTransaction(undefined as unknown as string[])).toBe(false);
    expect(canActionTransaction(null as unknown as string[])).toBe(false);
  });

  // ===================================================================
  // AC-1 / AC-3 / AC-5 underpinning — approveTransaction call shape
  // ===================================================================

  // R9 / BR1 — approveTransaction POSTs to the approve endpoint with the
  // TransactionId BAKED INTO the endpoint query string (post() has no params for
  // this contract — mirrors cancelFile), an undefined body, the LastChangedUser
  // audit header as the 3rd arg, and requiresAuth. Returns the resolved
  // DefaultResponse to the caller.
  it('approveTransaction POSTs to the approve endpoint with the id in the query string + audit header', async () => {
    mockPost.mockResolvedValue(approveOk());

    const result = await approveTransaction(7001, 'Avery Pruver');

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/transactions/approve?TransactionId=7001',
      undefined,
      'Avery Pruver',
      { requiresAuth: true },
    );
    expect(result).toEqual(approveOk());
  });

  // ===================================================================
  // Integration render — Approve visible for Approver / hidden for Importer
  // (underpins AC-1)
  // ===================================================================

  // AC-1 / BR9 / §2 — an Approver sees an Approve control on the Imported row, and
  // NOT on the already-Approved row (approve is offered only on Imported). Driven
  // through the real page so the canActionTransaction gate is proven WIRED.
  it('shows an Approve action on Imported rows for an Approver (not on Approved rows)', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // The Imported row offers an Approve control.
    const importedRow = rowForReference('TXN-IMP-001');
    expect(
      within(importedRow).getByRole('button', { name: /approve/i }),
    ).toBeInTheDocument();

    // The already-Approved row offers NO Approve control (terminal status).
    const approvedRow = rowForReference('TXN-APR-002');
    expect(
      within(approvedRow).queryByRole('button', { name: /approve/i }),
    ).not.toBeInTheDocument();
  });

  // AC-1 / BR9 / §2 — an Importer sees NO action controls on ANY row (hidden, not
  // disabled — denied actions are HIDDEN per §2). The Importer still sees the
  // read-only table.
  it('hides the Approve action entirely from an Importer on every row', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Importer']));
    mockGet.mockResolvedValue(transactionsList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // No Approve control anywhere — neither enabled nor disabled.
    expect(
      screen.queryByRole('button', { name: /approve/i }),
    ).not.toBeInTheDocument();
  });

  // ===================================================================
  // Integration render — confirm dialog names the Reference (underpins AC-2)
  // ===================================================================

  // AC-2 / BR3 — clicking Approve opens a confirmation that NAMES the transaction
  // Reference so the Approver confirms the right subject before the (serious)
  // action runs. (Focus-default-on-Cancel + destructive styling are proven in
  // Playwright; here we assert the dialog opens and names the subject.)
  it('opens a confirmation naming the transaction reference when Approve is clicked', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    const importedRow = rowForReference('TXN-IMP-001');
    await user.click(
      within(importedRow).getByRole('button', { name: /approve/i }),
    );

    // A confirmation dialog opens and names the Reference of the subject row.
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/TXN-IMP-001/)).toBeInTheDocument();
    // It offers a Cancel affordance (the safe default per BR3).
    expect(
      within(dialog).getByRole('button', { name: /cancel/i }),
    ).toBeInTheDocument();
  });

  // ===================================================================
  // Integration render — confirm performs the approve + optimistic flip + success
  // toast (underpins AC-3)
  // ===================================================================

  // AC-3 / R9 / BR1 — confirming calls approveTransaction with the subject id (via
  // the client POST), optimistically transitions that row's Status to Approved, and
  // raises a SUCCESS toast. The acting user's name flows into the LastChangedUser
  // audit header.
  it('approves the row on confirm: calls the API with the id, flips the row to Approved, raises a success toast', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());
    mockPost.mockResolvedValue(approveOk());

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    // The subject row is Imported before approval.
    const importedRow = rowForReference('TXN-IMP-001');
    expect(within(importedRow).getByText('Imported')).toBeInTheDocument();

    // Approve -> confirm.
    await user.click(
      within(importedRow).getByRole('button', { name: /approve/i }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /approve/i }));

    // The approve API is called for the subject id, carrying the acting user in the
    // LastChangedUser audit header (3rd post arg) with requiresAuth.
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/transactions/approve?TransactionId=7001',
        undefined,
        'Avery Pruver',
        { requiresAuth: true },
      );
    });

    // The row optimistically flips to Approved (BR1) and the Approve control on it
    // is gone (terminal status), and a success toast is raised.
    await waitFor(() => {
      const updatedRow = rowForReference('TXN-IMP-001');
      expect(within(updatedRow).getByText('Approved')).toBeInTheDocument();
      expect(
        within(updatedRow).queryByRole('button', { name: /approve/i }),
      ).not.toBeInTheDocument();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  // ===================================================================
  // Integration render — failed approve leaves the row Imported + error toast
  // (underpins AC-5 — no silent failure)
  // ===================================================================

  // AC-5 — when the approve request REJECTS, the row stays Imported (no optimistic
  // commit) and an ERROR toast is raised; the failure is never swallowed silently.
  it('keeps the row Imported and raises an error toast when the approve request fails', async () => {
    const user = userEvent.setup();
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());
    mockPost.mockRejectedValue(new Error('Approve failed'));

    render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    const importedRow = rowForReference('TXN-IMP-001');
    await user.click(
      within(importedRow).getByRole('button', { name: /approve/i }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /approve/i }));

    // An error toast is raised (the failure is surfaced, not swallowed).
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });

    // The row remains Imported and still offers Approve (no optimistic commit on a
    // rejected request).
    const unchangedRow = rowForReference('TXN-IMP-001');
    expect(within(unchangedRow).getByText('Imported')).toBeInTheDocument();
    expect(
      within(unchangedRow).getByRole('button', { name: /approve/i }),
    ).toBeInTheDocument();
  });

  // ===================================================================
  // Accessibility — the transactions surface with the Approve action present
  // ===================================================================

  // The Approver view (with the row-level Approve controls rendered) has no
  // accessibility violations.
  it('has no accessibility violations with the Approve controls rendered', async () => {
    mockUseSession.mockReturnValue(sessionFor(['Approver']));
    mockGet.mockResolvedValue(transactionsList());

    const { container } = render(<TransactionsPage />);

    await waitFor(() => {
      expect(screen.getByText('TXN-IMP-001')).toBeInTheDocument();
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
