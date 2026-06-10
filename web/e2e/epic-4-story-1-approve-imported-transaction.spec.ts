/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (adds the Approver-only Approve row-action to the Epic-3 table)
 *
 * E2E spec for Epic 4, Story 1: Approving an imported transaction.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R9, BR3, BR9) and
 * documentation/transactions-api.yaml:
 *   - GET  /v1/transactions                              -> TransactionReadList
 *   - POST /v1/transactions/approve?TransactionId={id}   -> DefaultResponse,
 *     with a required `LastChangedUser` header (name of the acting user). The
 *     approve endpoint sets that transaction's Status to 'Approved'.
 *
 * Behaviour under test (the Approve row-action on /transactions):
 *   - AC-1: an Approver sees an Approve action on every Imported row; an Importer
 *           sees no action controls on any row (BR9 — Approve is Approver-only).
 *   - AC-2: Approve opens an alert-dialog confirmation naming that row's
 *           Reference; the confirm button is styled as a destructive/serious
 *           action; default focus is on Cancel/dismiss (BR3 — guard the action).
 *   - AC-3: confirming fires POST /v1/transactions/approve with the right
 *           TransactionId, flips that row's Status to 'Approved' immediately
 *           (optimistic), and surfaces a success notification; cancelling leaves
 *           the row unchanged and fires no request.
 *   - AC-5: if the approve request fails (500), the row stays 'Imported' and an
 *           error notification appears.
 *   (AC-4 — the LastChangedUser header carries the acting user — is covered by
 *   the Vitest sibling, which can assert request headers directly.)
 *
 * Developer contract: the Approve action issues the app's API client
 * post('/v1/transactions/approve', ...) with the TransactionId query param and a
 * LastChangedUser header, resolving to
 * `${NEXT_PUBLIC_API_BASE_URL}/v1/transactions/approve`. Status drives the row
 * badge; an optimistic flip to 'Approved' happens on confirm.
 *
 * Mocking follows the project default (page-route-with-spec) with the same
 * deliberate extension the Epic-2/3 specs use (NFR8: the transactions backend is
 * NOT serving these paths during the build): this spec intercepts BOTH the
 * same-origin BFF auth proxy routes (POST /api/auth/login, GET /api/auth/userinfo
 * — built in Epic 1) AND the data + action calls the API client issues to the
 * configured base URL (GET **\/v1/transactions**, POST **\/v1/transactions/approve**).
 * All response shapes are derived from the OpenAPI specs above, so no live BFF or
 * transactions backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so any
 * alert/status locator below is scoped to a specific region (the row, the
 * dialog, or the toast region) rather than the whole document.
 *
 * These tests WILL FAIL until the Approve row-action is implemented (TDD red).
 */
import {
  test,
  expect,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';
import type { TransactionRead } from './fixtures/transactions';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
// The approve intercept is registered BEFORE the list intercept so its more
// specific path wins (page.route matches most-recently-added first; ordering the
// approve handler first keeps the broader **\/v1/transactions** glob from
// swallowing POST .../approve).
const APPROVE_API = '**/v1/transactions/approve**';
const TRANSACTIONS_API = '**/v1/transactions**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';

type Persona = 'Importer' | 'Approver';

// ---------------------------------------------------------------------------
// Fixture — at least one Imported row with a KNOWN, unique Reference so the
// confirmation-dialog assertion (AC-2) can bind to that exact text, plus a
// second already-Approved row to prove the action is offered only on Imported
// rows. Shapes follow transactions-api.yaml -> TransactionRead (PascalCase).
// ---------------------------------------------------------------------------

/** The Imported row the action tests operate on. Its Reference is unique. */
const IMPORTED_REFERENCE = 'TXN-IMP-001';
const IMPORTED_ID = 4101;

/** A second already-Approved row — the Approve action must NOT appear on it. */
const APPROVED_REFERENCE = 'TXN-APR-002';
const APPROVED_ID = 4102;

function row(
  partial: Pick<TransactionRead, 'Id' | 'Reference' | 'Status'>,
): TransactionRead {
  return {
    FileLogId: 1,
    FileName: 'transactions_2025_04_30.csv',
    TransactionDate: '2025-04-30 15:00:00',
    AccountNumber: `100000${partial.Id}`,
    // Description deliberately carries NO Reference substring so a Reference
    // locator matches exactly one cell per row (Epic-3 fixture convention).
    Description: `Payment entry ${partial.Id}`,
    Amount: 1500.5,
    TransactionType: 'Debit',
    Currency: 'ZAR',
    UserNote: '',
    LastChangedUser: 'John Doe',
    LastChangedDate: '2025-04-30 15:00:00',
    ...partial,
  };
}

/** A list with one Imported row (the action target) and one Approved row. */
function approvalFixture(): { Transactions: TransactionRead[] } {
  return {
    Transactions: [
      row({
        Id: IMPORTED_ID,
        Reference: IMPORTED_REFERENCE,
        Status: 'Imported',
      }),
      row({
        Id: APPROVED_ID,
        Reference: APPROVED_REFERENCE,
        Status: 'Approved',
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Auth + data mocking (mirrors the Epic-3 transactions spec).
// ---------------------------------------------------------------------------

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. Both personas can
 * view Transactions (project-brief §2), so both Pages lists include
 * /transactions; only the Importer additionally gets /upload.
 */
function userInfoFor(persona: Persona) {
  const pages =
    persona === 'Importer'
      ? [
          { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
          { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
          { Id: 3, Name: 'Upload', Route: UPLOAD_ROUTE },
        ]
      : [
          { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
          { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
        ];

  return {
    Id: persona === 'Importer' ? 1 : 2,
    Email: persona === 'Importer' ? importerUser.email : approverUser.email,
    FirstName: persona,
    LastName: 'User',
    RolesString: persona,
    Roles: [
      {
        Id: persona === 'Importer' ? 1 : 2,
        Name: persona,
        Pages: pages,
        LastChangedUser: 'system',
        LastChangedDate: '2025-04-30 15:00:00',
      },
    ],
    Pages: pages,
    LastChangedUser: 'system',
    LastChangedDate: '2025-04-30 15:00:00',
  };
}

/** Stubs the login + userinfo proxy as a signed-in session for the given persona. */
async function mockSignedInAs(page: Page, persona: Persona) {
  await page.route(LOGIN_PROXY, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Messages: ['Login successful'] }),
    }),
  );
  await page.route(USERINFO_PROXY, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(persona)),
    }),
  );
}

/** Stubs GET /v1/transactions with a 200 + the supplied TransactionReadList body. */
async function mockTransactions(page: Page, body: unknown) {
  await page.route(TRANSACTIONS_API, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

/** Records every POST .../approve that fires, capturing its TransactionId query param. */
interface ApproveRecorder {
  calls: { transactionId: string | null }[];
}

/**
 * Intercepts POST **\/v1/transactions/approve** with the given HTTP status and
 * records each call's TransactionId query param. Registered AFTER mockTransactions
 * so this more specific handler is consulted first for the approve path.
 */
async function mockApprove(
  page: Page,
  status: number,
): Promise<ApproveRecorder> {
  const recorder: ApproveRecorder = { calls: [] };
  await page.route(APPROVE_API, (route: Route) => {
    const url = new URL(route.request().url());
    recorder.calls.push({
      transactionId: url.searchParams.get('TransactionId'),
    });
    const ok = status >= 200 && status < 300;
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        ok
          ? {
              Id: IMPORTED_ID,
              MessageType: 'Success',
              Messages: ['Transaction approved'],
            }
          : { MessageType: 'Error', Messages: ['Internal Server Error'] },
      ),
    });
  });
  return recorder;
}

/** Drives the login form to sign the given persona in. */
async function signIn(page: Page, persona: Persona) {
  const creds = persona === 'Importer' ? importerUser : approverUser;
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
}

/**
 * Signs the persona in and lands them on /transactions with the supplied list
 * mocked. The approve intercept (when given) is registered AFTER the list so the
 * approve path resolves to it. Returns once the transactions URL is active.
 */
async function openTransactionsAs(
  page: Page,
  persona: Persona,
  opts: { transactionsBody?: unknown; approveStatus?: number } = {},
): Promise<ApproveRecorder | null> {
  const { transactionsBody = approvalFixture(), approveStatus } = opts;
  await mockSignedInAs(page, persona);
  await mockTransactions(page, transactionsBody);
  const recorder =
    approveStatus !== undefined ? await mockApprove(page, approveStatus) : null;
  await signIn(page, persona);
  await page.goto(TRANSACTIONS_ROUTE);
  await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}$`));
  return recorder;
}

// ---------------------------------------------------------------------------
// Scoped locators.
// ---------------------------------------------------------------------------

/** The transactions table, scoped to the page's main content region. */
const transactionsTable = (page: Page) =>
  page.getByRole('main').getByRole('table');

/** The single table row that renders the given Reference. */
const rowFor = (page: Page, reference: string): Locator =>
  transactionsTable(page).getByRole('row').filter({ hasText: reference });

/** The confirmation dialog (alertdialog preferred, falling back to dialog). */
const confirmDialog = (page: Page): Locator =>
  page.getByRole('alertdialog').or(page.getByRole('dialog'));

/**
 * The Approve control inside a given row. Scoping to the row keeps the locator
 * unambiguous when the table holds multiple actionable rows.
 */
const approveControlIn = (rowLocator: Locator): Locator =>
  rowLocator.getByRole('button', { name: /approve/i });

test.describe('Epic 4, Story 1: Approving an imported transaction', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: Approver sees Approve on Imported rows; Importer sees no action controls.
  test('an Approver sees an Approve action on the Imported row, but not on an Approved row', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    await expect(transactionsTable(page)).toBeVisible();

    // The Imported row offers Approve (Approver + Imported -> action present).
    await expect(
      approveControlIn(rowFor(page, IMPORTED_REFERENCE)),
    ).toBeVisible();

    // The already-Approved row offers no Approve action (only Imported rows are
    // actionable — approving an Approved row is meaningless).
    await expect(
      approveControlIn(rowFor(page, APPROVED_REFERENCE)),
    ).toHaveCount(0);
  });

  // AC-1: an Importer sees NO action controls on any row (BR9 — Approver-only).
  test('an Importer sees no Approve action on any row', async ({ page }) => {
    await openTransactionsAs(page, 'Importer');

    await expect(transactionsTable(page)).toBeVisible();
    // The Imported row is present...
    await expect(rowFor(page, IMPORTED_REFERENCE)).toBeVisible();

    // ...but the Importer gets no Approve (or Reject) action anywhere (BR9).
    await expect(
      page.getByRole('main').getByRole('button', { name: /approve|reject/i }),
    ).toHaveCount(0);
  });

  // AC-2: Approve opens a confirmation naming the row's Reference; confirm is
  // styled destructive; default focus is on Cancel.
  test('Approve opens a confirmation naming the Reference, with a destructive confirm and default focus on Cancel', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    await approveControlIn(rowFor(page, IMPORTED_REFERENCE)).click();

    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();

    // The confirmation names the specific transaction being approved (BR3 —
    // the guard tells the Approver WHICH transaction they are acting on).
    await expect(dialog).toContainText(IMPORTED_REFERENCE);

    // The confirm button is styled as a serious/destructive action. Shadcn's
    // destructive variant renders a token-driven destructive background class;
    // assert the confirm control carries it (no raw hex — see styling policy).
    const confirmButton = dialog.getByRole('button', { name: /^approve$/i });
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toHaveClass(/destructive/);

    // Default focus rests on the safe choice (Cancel/dismiss), so an accidental
    // Enter does not approve (BR3 — destructive default focus = Cancel).
    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeFocused();
  });

  // AC-3: confirming fires POST approve with the right TransactionId, flips the
  // row Status to Approved optimistically, and shows a success notification.
  test('confirming approves the transaction: row flips to Approved, success toast, POST fires with the right TransactionId', async ({
    page,
  }) => {
    const approve = await openTransactionsAs(page, 'Approver', {
      approveStatus: 200,
    });

    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    // Precondition: the row starts Imported.
    await expect(importedRow.getByText(/imported/i)).toBeVisible();

    await approveControlIn(importedRow).click();
    await confirmDialog(page)
      .getByRole('button', { name: /^approve$/i })
      .click();

    // The row's Status cell flips to Approved (optimistic — asserted directly on
    // the row, scoped so the badge label is the only match in that row).
    await expect(importedRow.getByText(/approved/i)).toBeVisible();
    await expect(importedRow.getByText(/^imported$/i)).toHaveCount(0);

    // A success notification appears. Toasts announce via role="status"; scope to
    // the toaster region so we never match the body-level route announcer.
    const toastRegion = page.getByRole('region', { name: /notification/i });
    await expect(
      toastRegion.getByText(/approved|success/i).first(),
    ).toBeVisible();

    // The POST fired exactly once, carrying the Imported row's Id as TransactionId.
    expect(approve?.calls).toHaveLength(1);
    expect(approve?.calls[0]?.transactionId).toBe(String(IMPORTED_ID));
  });

  // AC-3 (cancel path): cancelling leaves the row unchanged and fires no request.
  test('cancelling the confirmation leaves the row Imported and fires no approve request', async ({
    page,
  }) => {
    const approve = await openTransactionsAs(page, 'Approver', {
      approveStatus: 200,
    });

    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    await expect(importedRow.getByText(/imported/i)).toBeVisible();

    await approveControlIn(importedRow).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /cancel/i }).click();

    // The dialog closes and the row is untouched: still Imported.
    await expect(dialog).toBeHidden();
    await expect(importedRow.getByText(/imported/i)).toBeVisible();
    await expect(importedRow.getByText(/^approved$/i)).toHaveCount(0);

    // No approve request was ever issued.
    expect(approve?.calls).toHaveLength(0);
  });

  // AC-5: a failed approve leaves the row Imported and surfaces an error toast.
  test('a failed approve leaves the row Imported and shows an error notification', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver', { approveStatus: 500 });

    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    await expect(importedRow.getByText(/imported/i)).toBeVisible();

    await approveControlIn(importedRow).click();
    await confirmDialog(page)
      .getByRole('button', { name: /^approve$/i })
      .click();

    // An error notification appears (scoped to the toast region, not the body
    // route announcer).
    const toastRegion = page.getByRole('region', { name: /notification/i });
    await expect(
      toastRegion.getByText(/failed|error|could not|unable/i).first(),
    ).toBeVisible();

    // The optimistic flip is rolled back (or never committed): the row remains
    // Imported after the request fails.
    await expect(importedRow.getByText(/imported/i)).toBeVisible();
    await expect(importedRow.getByText(/^approved$/i)).toHaveCount(0);
  });
});
