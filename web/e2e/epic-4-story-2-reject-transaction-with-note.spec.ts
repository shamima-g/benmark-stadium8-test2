/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (adds the Approver-only Reject row-action + a
 *   mandatory-note modal alongside the Epic-4 Story-1 Approve action)
 *
 * E2E spec for Epic 4, Story 2: Rejecting a transaction with a note.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R10, BR2, BR3, BR9)
 * and documentation/transactions-api.yaml:
 *   - GET  /v1/transactions                            -> TransactionReadList
 *   - POST /v1/transactions/reject?TransactionId={id}  -> DefaultResponse, with a
 *     required JSON body { UserNote: string } (TransactionRejectWrite) and a
 *     required `LastChangedUser` header. The reject endpoint sets that
 *     transaction's Status to 'Rejected' and records the supplied note.
 *
 * Behaviour under test (the Reject row-action on /transactions):
 *   - AC-1: an Approver sees a Reject action on every Imported row; an Importer
 *           sees no action controls on any row (BR9 — Reject is Approver-only).
 *   - AC-2: Reject opens a modal naming that row's Reference, with a mandatory
 *           rejection-note field; the submit (destructive confirm) is disabled
 *           until a note is entered; default focus rests on Cancel (BR2/BR3).
 *   - AC-3: leaving the note empty (on blur, or on a submit attempt) surfaces a
 *           note-required validation message; typing a note clears it and enables
 *           submit. Whitespace-only counts as empty (BR2).
 *   - AC-4: submitting with a note fires POST /v1/transactions/reject with the
 *           right TransactionId AND the typed UserNote in the body, flips that
 *           row's Status to 'Rejected' immediately (optimistic), and surfaces a
 *           success notification.
 *   - AC-6: if the reject request fails (500), the row stays 'Imported' and an
 *           error notification appears.
 *   (AC-5 — the LastChangedUser header carries the acting user — is covered by
 *   the Vitest sibling, which can assert request headers directly.)
 *
 * Developer contract: the Reject action issues the app's API client
 * post('/v1/transactions/reject', { UserNote }, ...) with the TransactionId query
 * param and a LastChangedUser header, resolving to
 * `${NEXT_PUBLIC_API_BASE_URL}/v1/transactions/reject`. Status drives the row
 * badge; an optimistic flip to 'Rejected' happens on submit.
 *
 * Mocking follows the project default (page-route-with-spec) with the same
 * deliberate extension the Epic-2/3 and Story-1 specs use (NFR8: the transactions
 * backend is NOT serving these paths during the build): this spec intercepts BOTH
 * the same-origin BFF auth proxy routes (POST /api/auth/login, GET
 * /api/auth/userinfo — built in Epic 1) AND the data + action calls the API
 * client issues to the configured base URL (GET **\/v1/transactions**, POST
 * **\/v1/transactions/reject**). All response shapes are derived from the OpenAPI
 * specs above, so no live BFF or transactions backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so any
 * alert/status locator below is scoped to a specific region (the row, the dialog,
 * or the toast region) rather than the whole document.
 *
 * These tests WILL FAIL until the Reject row-action + note modal are implemented
 * (TDD red).
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
// The reject intercept is registered AFTER the list intercept so its more
// specific path wins (page.route matches most-recently-added first; registering
// the reject handler last keeps the broader **\/v1/transactions** glob from
// swallowing POST .../reject).
const REJECT_API = '**/v1/transactions/reject**';
const TRANSACTIONS_API = '**/v1/transactions**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';

type Persona = 'Importer' | 'Approver';

// ---------------------------------------------------------------------------
// Fixture — at least one Imported row with a KNOWN, unique Reference so the
// modal assertion (AC-2) can bind to that exact text, plus a second
// already-Rejected row to prove the action is offered only on Imported rows.
// Shapes follow transactions-api.yaml -> TransactionRead (PascalCase).
// ---------------------------------------------------------------------------

/** The Imported row the action tests operate on. Its Reference is unique. */
const IMPORTED_REFERENCE = 'TXN-IMP-201';
const IMPORTED_ID = 4201;

/** A second already-Rejected row — the Reject action must NOT appear on it. */
const REJECTED_REFERENCE = 'TXN-REJ-202';
const REJECTED_ID = 4202;

/** The note an Approver types when rejecting (BR2 — mandatory rejection note). */
const REJECTION_NOTE = 'Amount does not match supporting document';

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

/** A list with one Imported row (the action target) and one Rejected row. */
function rejectionFixture(): { Transactions: TransactionRead[] } {
  return {
    Transactions: [
      row({
        Id: IMPORTED_ID,
        Reference: IMPORTED_REFERENCE,
        Status: 'Imported',
      }),
      row({
        Id: REJECTED_ID,
        Reference: REJECTED_REFERENCE,
        Status: 'Rejected',
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Auth + data mocking (mirrors the Story-1 approve spec).
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

/**
 * Records every POST .../reject that fires, capturing both its TransactionId
 * query param and the parsed JSON body (so AC-4 can assert the UserNote travelled
 * with the request).
 */
interface RejectCall {
  transactionId: string | null;
  body: { UserNote?: string } | null;
}
interface RejectRecorder {
  calls: RejectCall[];
}

/**
 * Intercepts POST **\/v1/transactions/reject** with the given HTTP status and
 * records each call's TransactionId query param + JSON body. Registered AFTER
 * mockTransactions so this more specific handler is consulted first for the
 * reject path.
 */
async function mockReject(page: Page, status: number): Promise<RejectRecorder> {
  const recorder: RejectRecorder = { calls: [] };
  await page.route(REJECT_API, (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: { UserNote?: string } | null = null;
    try {
      body = request.postDataJSON() as { UserNote?: string };
    } catch {
      body = null;
    }
    recorder.calls.push({
      transactionId: url.searchParams.get('TransactionId'),
      body,
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
              Messages: ['Transaction rejected'],
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
 * mocked. The reject intercept (when given) is registered AFTER the list so the
 * reject path resolves to it. Returns once the transactions URL is active.
 */
async function openTransactionsAs(
  page: Page,
  persona: Persona,
  opts: { transactionsBody?: unknown; rejectStatus?: number } = {},
): Promise<RejectRecorder | null> {
  const { transactionsBody = rejectionFixture(), rejectStatus } = opts;
  await mockSignedInAs(page, persona);
  await mockTransactions(page, transactionsBody);
  const recorder =
    rejectStatus !== undefined ? await mockReject(page, rejectStatus) : null;
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

/** The reject modal (alertdialog preferred, falling back to dialog). */
const rejectDialog = (page: Page): Locator =>
  page.getByRole('alertdialog').or(page.getByRole('dialog'));

/**
 * The Reject control inside a given row. Scoping to the row keeps the locator
 * unambiguous when the table holds multiple actionable rows.
 */
const rejectControlIn = (rowLocator: Locator): Locator =>
  rowLocator.getByRole('button', { name: /reject/i });

/** The mandatory rejection-note input inside the modal. */
const noteFieldIn = (dialog: Locator): Locator =>
  dialog.getByRole('textbox', { name: /note|reason/i });

/**
 * The destructive submit/confirm control inside the modal. Named to NOT collide
 * with Cancel; the developer renders the confirm as "Reject" (the action), which
 * the row Reject trigger also reads as — but the dialog scope disambiguates it.
 */
const submitRejectIn = (dialog: Locator): Locator =>
  dialog.getByRole('button', { name: /^reject$/i });

/** The toast/notification region (never the body-level route announcer). */
const toastRegion = (page: Page): Locator =>
  page.getByRole('region', { name: /notification/i });

test.describe('Epic 4, Story 2: Rejecting a transaction with a note', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: Approver sees Reject on the Imported row, not on a Rejected row;
  // Importer sees no action controls on any row (BR9 — Reject is Approver-only).
  test('an Approver sees a Reject action on the Imported row, but not on an already-Rejected row', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    await expect(transactionsTable(page)).toBeVisible();

    // The Imported row offers Reject (Approver + Imported -> action present).
    await expect(
      rejectControlIn(rowFor(page, IMPORTED_REFERENCE)),
    ).toBeVisible();

    // The already-Rejected row offers no Reject action (only Imported rows are
    // actionable — rejecting a Rejected row is meaningless).
    await expect(rejectControlIn(rowFor(page, REJECTED_REFERENCE))).toHaveCount(
      0,
    );
  });

  // AC-1: an Importer sees NO action controls on any row (BR9 — Approver-only).
  test('an Importer sees no Reject action on any row', async ({ page }) => {
    await openTransactionsAs(page, 'Importer');

    await expect(transactionsTable(page)).toBeVisible();
    // The Imported row is present...
    await expect(rowFor(page, IMPORTED_REFERENCE)).toBeVisible();

    // ...but the Importer gets no Reject (or Approve) action anywhere (BR9).
    await expect(
      page.getByRole('main').getByRole('button', { name: /approve|reject/i }),
    ).toHaveCount(0);
  });

  // AC-2: Reject opens a modal naming the Reference, with a mandatory note field;
  // submit is disabled until a note is entered; default focus is on Cancel.
  test('Reject opens a modal naming the Reference, with a mandatory note field, a disabled submit, and default focus on Cancel', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    await rejectControlIn(rowFor(page, IMPORTED_REFERENCE)).click();

    const dialog = rejectDialog(page);
    await expect(dialog).toBeVisible();

    // The modal names the specific transaction being rejected (BR3 — the guard
    // tells the Approver WHICH transaction they are acting on).
    await expect(dialog).toContainText(IMPORTED_REFERENCE);

    // It carries a mandatory rejection-note field (BR2).
    const noteField = noteFieldIn(dialog);
    await expect(noteField).toBeVisible();

    // The destructive submit is disabled until a note is entered (BR2 — submit
    // blocked while the mandatory note is empty).
    const submit = submitRejectIn(dialog);
    await expect(submit).toBeVisible();
    await expect(submit).toHaveClass(/destructive/);
    await expect(submit).toBeDisabled();

    // Default focus rests on the safe choice (Cancel/dismiss), so an accidental
    // Enter does not reject (BR3 — destructive default focus = Cancel).
    await expect(dialog.getByRole('button', { name: /cancel/i })).toBeFocused();
  });

  // AC-3: empty note on blur (or a submit attempt) shows a note-required message;
  // entering a note clears it and enables submit. Whitespace-only counts as empty.
  test('an empty or whitespace-only note surfaces a note-required message; typing a real note clears it and enables submit', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    await rejectControlIn(rowFor(page, IMPORTED_REFERENCE)).click();
    const dialog = rejectDialog(page);
    const noteField = noteFieldIn(dialog);
    const submit = submitRejectIn(dialog);

    // Focus then blur the empty field -> a validation message appears, and the
    // submit stays disabled.
    await noteField.focus();
    await noteField.blur();
    const validation = dialog.getByText(/required|enter a (note|reason)/i);
    await expect(validation).toBeVisible();
    await expect(submit).toBeDisabled();

    // Whitespace-only is treated as empty (BR2): the message persists, submit
    // stays disabled.
    await noteField.fill('   ');
    await noteField.blur();
    await expect(validation).toBeVisible();
    await expect(submit).toBeDisabled();

    // Typing a real note clears the message and enables submit.
    await noteField.fill(REJECTION_NOTE);
    await expect(
      dialog.getByText(/required|enter a (note|reason)/i),
    ).toHaveCount(0);
    await expect(submit).toBeEnabled();
  });

  // AC-4: submitting with a note fires POST reject with the right TransactionId
  // AND the UserNote in the body, flips the row Status to Rejected optimistically,
  // and shows a success notification.
  test('submitting with a note rejects the transaction: POST carries the TransactionId + UserNote, the row flips to Rejected, success toast', async ({
    page,
  }) => {
    const reject = await openTransactionsAs(page, 'Approver', {
      rejectStatus: 200,
    });

    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    // Precondition: the row starts Imported.
    await expect(importedRow.getByText(/imported/i)).toBeVisible();

    await rejectControlIn(importedRow).click();
    const dialog = rejectDialog(page);
    await noteFieldIn(dialog).fill(REJECTION_NOTE);
    await submitRejectIn(dialog).click();

    // The row's Status cell flips to Rejected (optimistic — asserted directly on
    // the row, scoped so the badge label is the only match in that row).
    await expect(importedRow.getByText(/rejected/i)).toBeVisible();
    await expect(importedRow.getByText(/^imported$/i)).toHaveCount(0);

    // A success notification appears, scoped to the toaster region so we never
    // match the body-level route announcer.
    await expect(
      toastRegion(page)
        .getByText(/rejected|success/i)
        .first(),
    ).toBeVisible();

    // The POST fired exactly once, carrying the Imported row's Id as TransactionId
    // and the typed note as UserNote in the body (TransactionRejectWrite).
    expect(reject?.calls).toHaveLength(1);
    expect(reject?.calls[0]?.transactionId).toBe(String(IMPORTED_ID));
    expect(reject?.calls[0]?.body?.UserNote).toBe(REJECTION_NOTE);
  });

  // AC-6: a failed reject leaves the row Imported and surfaces an error toast.
  test('a failed reject leaves the row Imported and shows an error notification', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver', { rejectStatus: 500 });

    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    await expect(importedRow.getByText(/imported/i)).toBeVisible();

    await rejectControlIn(importedRow).click();
    const dialog = rejectDialog(page);
    await noteFieldIn(dialog).fill(REJECTION_NOTE);
    await submitRejectIn(dialog).click();

    // An error notification appears (scoped to the toast region, not the body
    // route announcer).
    await expect(
      toastRegion(page)
        .getByText(/failed|error|could not|unable/i)
        .first(),
    ).toBeVisible();

    // The optimistic flip is rolled back (or never committed): the row remains
    // Imported after the request fails.
    await expect(importedRow.getByText(/imported/i)).toBeVisible();
    await expect(importedRow.getByText(/^rejected$/i)).toHaveCount(0);
  });
});
