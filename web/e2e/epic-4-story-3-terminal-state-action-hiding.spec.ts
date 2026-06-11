/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (LAYERS the terminal-state guard + decided-rows
 *   banner onto the Epic-4 Story-1/2 Approve & Reject actions)
 *
 * E2E spec for Epic 4, Story 3: Hiding actions once a transaction is decided.
 *
 * Source of truth: generated-docs/specs/project-brief.md (BR1) and
 * documentation/transactions-api.yaml:
 *   - GET  /v1/transactions                              -> TransactionReadList
 *   - POST /v1/transactions/approve?TransactionId={id}   -> DefaultResponse
 *   - POST /v1/transactions/reject?TransactionId={id}    -> DefaultResponse
 *
 * Behaviour under test (terminal-state action hiding on /transactions, BR1):
 *   - AC-1: Approved and Rejected rows show NO Approve or Reject action for an
 *           Approver; only Imported rows carry the actions. (A decided transaction
 *           can no longer be changed — only an Imported row is actionable.)
 *   - AC-2: when the visible transactions include any Approved or Rejected row, a
 *           banner at the top of the page explains that decided transactions can no
 *           longer be actioned. When ALL visible rows are Imported (no terminal
 *           rows), the banner is NOT shown — proving the banner is genuinely tied
 *           to the presence of decided rows.
 *   - AC-4: confirming an action on a row that is ALREADY decided dismisses the
 *           confirmation with an explanation instead of changing the status. This
 *           is the concurrent-change path: the row was Imported when the modal
 *           opened, but became terminal before confirm. We simulate the race by
 *           having the approve/reject endpoint report the row is already decided
 *           (a 409-style "already decided" response): the modal closes with an
 *           explanatory message, the row's Status is NOT mutated to claim the
 *           Approver's decision, and NO success toast appears.
 *
 * Developer contract: the Approve/Reject row controls render ONLY on Imported rows
 * (canActionTransaction + Status === 'Imported'); a decided row offers no action
 * (Story 1/2 already gate the controls this way — this spec pins that as BR1's
 * terminal invariant). A page-level banner appears whenever the currently-visible
 * rows include any Approved or Rejected transaction. When a confirm fires against a
 * row the backend reports as already decided, the action handler treats it as a
 * no-op decision: it closes the dialog and surfaces an explanatory (non-success)
 * notification rather than optimistically flipping the row or claiming success.
 *
 * Mocking follows the project default (page-route-with-spec) with the same
 * deliberate extension the Epic-2/3 and Story-1/2 specs use (NFR8: the transactions
 * backend is NOT serving these paths during the build): this spec intercepts BOTH
 * the same-origin BFF auth proxy routes (POST /api/auth/login, GET
 * /api/auth/userinfo — built in Epic 1) AND the data + action calls the API client
 * issues to the configured base URL (GET **\/v1/transactions**, POST
 * **\/v1/transactions/approve**, POST **\/v1/transactions/reject**). All response
 * shapes are derived from the OpenAPI specs above, so no live BFF or transactions
 * backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so any
 * alert/status locator below is scoped to a specific region (the row, the dialog,
 * the banner, or the toast region) rather than the whole document.
 *
 * These tests WILL FAIL until the decided-rows banner + already-decided confirm
 * guard are implemented (TDD red).
 */
import {
  test,
  expect,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import { approverUser } from './fixtures/credentials';
import type { TransactionRead } from './fixtures/transactions';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
// The approve/reject intercepts are registered AFTER the list intercept so their
// more specific paths win (page.route matches most-recently-added first;
// registering the action handlers last keeps the broader **\/v1/transactions**
// glob from swallowing the POST .../approve and POST .../reject calls).
const APPROVE_API = '**/v1/transactions/approve**';
const REJECT_API = '**/v1/transactions/reject**';
const TRANSACTIONS_API = '**/v1/transactions**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';

// ---------------------------------------------------------------------------
// Fixture — a mixed list (Imported + Approved + Rejected) so AC-1 (only Imported
// rows carry actions) and AC-2 (banner present when terminal rows exist) are both
// exercisable, plus an all-Imported list for AC-2's negative case. Each row has a
// KNOWN, unique Reference so a row locator binds to exactly that row. Shapes
// follow transactions-api.yaml -> TransactionRead (PascalCase).
// ---------------------------------------------------------------------------

/** The Imported row the action tests operate on. Its Reference is unique. */
const IMPORTED_REFERENCE = 'TXN-IMP-301';
const IMPORTED_ID = 4301;

/** An already-Approved row — no action must appear on it (AC-1). */
const APPROVED_REFERENCE = 'TXN-APR-302';
const APPROVED_ID = 4302;

/** An already-Rejected row — no action must appear on it (AC-1). */
const REJECTED_REFERENCE = 'TXN-REJ-303';
const REJECTED_ID = 4303;

/** A note an Approver types when exercising the Reject concurrent-change path. */
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

/** A mixed list: one Imported (actionable), one Approved, one Rejected (decided). */
function mixedFixture(): { Transactions: TransactionRead[] } {
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
      row({
        Id: REJECTED_ID,
        Reference: REJECTED_REFERENCE,
        Status: 'Rejected',
      }),
    ],
  };
}

/** An all-Imported list (NO terminal rows) — drives AC-2's negative case. */
function allImportedFixture(): { Transactions: TransactionRead[] } {
  return {
    Transactions: [
      row({
        Id: IMPORTED_ID,
        Reference: IMPORTED_REFERENCE,
        Status: 'Imported',
      }),
      row({ Id: 4304, Reference: 'TXN-IMP-304', Status: 'Imported' }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Auth + data mocking (mirrors the Story-1/2 specs). This story only exercises
// the Approver persona (BR1 — the actions and their hiding are Approver-only).
// ---------------------------------------------------------------------------

/**
 * A UserInfoRead body (auth-api.yaml) for the Approver. The Approver can view
 * Transactions (project-brief §2); the Pages list drives the BFF session.
 */
function approverUserInfo() {
  const pages = [
    { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
    { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
  ];
  return {
    Id: 2,
    Email: approverUser.email,
    FirstName: 'Approver',
    LastName: 'User',
    RolesString: 'Approver',
    Roles: [
      {
        Id: 2,
        Name: 'Approver',
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

/** Stubs the login + userinfo proxy as a signed-in Approver session. */
async function mockSignedInAsApprover(page: Page) {
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
      body: JSON.stringify(approverUserInfo()),
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

/** Records every action POST that fires, capturing its TransactionId query param. */
interface ActionRecorder {
  calls: { transactionId: string | null }[];
}

/**
 * Intercepts a POST action path (approve or reject) and fulfils it as an
 * "already decided" race response (HTTP 409 — the row was decided between the
 * modal opening and confirm). Records each call's TransactionId query param so
 * the spec can assert the POST fired. Registered AFTER mockTransactions so this
 * more specific handler is consulted first for the action path.
 */
async function mockActionAlreadyDecided(
  page: Page,
  pattern: string,
): Promise<ActionRecorder> {
  const recorder: ActionRecorder = { calls: [] };
  await page.route(pattern, (route: Route) => {
    const url = new URL(route.request().url());
    recorder.calls.push({
      transactionId: url.searchParams.get('TransactionId'),
    });
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        MessageType: 'Error',
        Messages: ['Transaction has already been decided.'],
      }),
    });
  });
  return recorder;
}

/** Drives the login form to sign the Approver in. */
async function signInAsApprover(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(approverUser.email);
  await page.getByLabel(/password/i).fill(approverUser.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
}

/**
 * Signs the Approver in and lands them on /transactions with the supplied list
 * mocked. When an action pattern is given, its "already decided" intercept is
 * registered AFTER the list so the action path resolves to it. Returns once the
 * transactions URL is active.
 */
async function openTransactions(
  page: Page,
  opts: { transactionsBody?: unknown; alreadyDecidedAction?: string } = {},
): Promise<ActionRecorder | null> {
  const { transactionsBody = mixedFixture(), alreadyDecidedAction } = opts;
  await mockSignedInAsApprover(page);
  await mockTransactions(page, transactionsBody);
  const recorder = alreadyDecidedAction
    ? await mockActionAlreadyDecided(page, alreadyDecidedAction)
    : null;
  await signInAsApprover(page);
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

/** The Approve control inside a given row. */
const approveControlIn = (rowLocator: Locator): Locator =>
  rowLocator.getByRole('button', { name: /approve/i });

/** The Reject control inside a given row. */
const rejectControlIn = (rowLocator: Locator): Locator =>
  rowLocator.getByRole('button', { name: /reject/i });

/** The mandatory rejection-note input inside the Reject modal. */
const noteFieldIn = (dialog: Locator): Locator =>
  dialog.getByRole('textbox', { name: /note|reason/i });

/**
 * The page-level "decided transactions can no longer be actioned" banner (BR1).
 * It is an informational status region scoped to main, so it never collides with
 * the body-level route announcer. Matched by its explanatory copy.
 */
const decidedBanner = (page: Page): Locator =>
  page
    .getByRole('main')
    .getByText(
      /decided|approved or rejected|can no longer be (actioned|changed)/i,
    );

/** The toast/notification region (never the body-level route announcer). */
const toastRegion = (page: Page): Locator =>
  page.getByRole('region', { name: /notification/i });

test.describe('Epic 4, Story 3: Hiding actions once a transaction is decided', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: Approved and Rejected rows show NO Approve/Reject action for an
  // Approver; only the Imported row carries the actions (BR1 — a decided
  // transaction can no longer be changed).
  test('only the Imported row offers Approve/Reject; Approved and Rejected rows offer no action', async ({
    page,
  }) => {
    await openTransactions(page);

    await expect(transactionsTable(page)).toBeVisible();

    // The Imported row offers BOTH actions (still actionable).
    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    await expect(approveControlIn(importedRow)).toBeVisible();
    await expect(rejectControlIn(importedRow)).toBeVisible();

    // The already-Approved row offers NO action (decided — cannot be changed).
    const approvedRow = rowFor(page, APPROVED_REFERENCE);
    await expect(approveControlIn(approvedRow)).toHaveCount(0);
    await expect(rejectControlIn(approvedRow)).toHaveCount(0);

    // The already-Rejected row offers NO action (decided — cannot be changed).
    const rejectedRow = rowFor(page, REJECTED_REFERENCE);
    await expect(approveControlIn(rejectedRow)).toHaveCount(0);
    await expect(rejectControlIn(rejectedRow)).toHaveCount(0);
  });

  // AC-2 (positive): when the visible rows include any decided (Approved/Rejected)
  // row, a banner at the top of the page explains decided transactions can no
  // longer be actioned.
  test('a banner explains decided transactions can no longer be actioned when terminal rows are present', async ({
    page,
  }) => {
    await openTransactions(page);

    await expect(transactionsTable(page)).toBeVisible();
    // The mixed list carries an Approved and a Rejected row, so the banner shows.
    await expect(decidedBanner(page).first()).toBeVisible();
  });

  // AC-2 (negative): when ALL visible rows are Imported (no decided rows), the
  // banner is NOT shown — proving its presence is genuinely tied to decided rows.
  test('the banner is NOT shown when every visible row is still Imported', async ({
    page,
  }) => {
    await openTransactions(page, { transactionsBody: allImportedFixture() });

    await expect(transactionsTable(page)).toBeVisible();
    // Both rows are Imported, so the table is populated...
    await expect(rowFor(page, IMPORTED_REFERENCE)).toBeVisible();
    // ...but with no decided rows present, the banner is absent.
    await expect(decidedBanner(page)).toHaveCount(0);
  });

  // AC-4 (Approve concurrent-change path): confirming an Approve on a row the
  // backend reports as already decided dismisses the dialog with an explanation
  // instead of flipping the status; no success toast is shown.
  test('confirming Approve on an already-decided row dismisses with an explanation and does not claim success', async ({
    page,
  }) => {
    const approve = await openTransactions(page, {
      alreadyDecidedAction: APPROVE_API,
    });

    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    // Precondition: the row is presented as Imported (still actionable).
    await expect(importedRow.getByText(/imported/i)).toBeVisible();

    await approveControlIn(importedRow).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^approve$/i }).click();

    // The POST fired with the row's Id — the race was a real attempt, not a
    // pre-empted no-op.
    expect(approve?.calls).toHaveLength(1);
    expect(approve?.calls[0]?.transactionId).toBe(String(IMPORTED_ID));

    // The dialog dismisses (the action is over) and an explanatory notification
    // tells the Approver the transaction was already decided.
    await expect(dialog).toBeHidden();
    await expect(
      toastRegion(page)
        .getByText(
          /already (been )?decided|already (approved|rejected)|no longer/i,
        )
        .first(),
    ).toBeVisible();

    // No success is claimed: the row is NOT optimistically flipped to Approved,
    // and no "approved/success" toast appears.
    await expect(importedRow.getByText(/^approved$/i)).toHaveCount(0);
    await expect(importedRow.getByText(/imported/i)).toBeVisible();
    await expect(
      toastRegion(page).getByText(
        /^transaction approved$|approval successful/i,
      ),
    ).toHaveCount(0);
  });

  // AC-4 (Reject concurrent-change path): confirming a Reject on a row the backend
  // reports as already decided dismisses the dialog with an explanation instead of
  // flipping the status; no success toast is shown.
  test('confirming Reject on an already-decided row dismisses with an explanation and does not claim success', async ({
    page,
  }) => {
    const reject = await openTransactions(page, {
      alreadyDecidedAction: REJECT_API,
    });

    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    await expect(importedRow.getByText(/imported/i)).toBeVisible();

    await rejectControlIn(importedRow).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    // The Reject modal requires a note before its destructive submit enables.
    await noteFieldIn(dialog).fill(REJECTION_NOTE);
    await dialog.getByRole('button', { name: /^reject$/i }).click();

    // The POST fired with the row's Id.
    expect(reject?.calls).toHaveLength(1);
    expect(reject?.calls[0]?.transactionId).toBe(String(IMPORTED_ID));

    // The dialog dismisses with an explanatory (already-decided) notification.
    await expect(dialog).toBeHidden();
    await expect(
      toastRegion(page)
        .getByText(
          /already (been )?decided|already (approved|rejected)|no longer/i,
        )
        .first(),
    ).toBeVisible();

    // No success is claimed: the row is NOT optimistically flipped to Rejected,
    // and no "rejected/success" toast appears.
    await expect(importedRow.getByText(/^rejected$/i)).toHaveCount(0);
    await expect(importedRow.getByText(/imported/i)).toBeVisible();
    await expect(
      toastRegion(page).getByText(
        /^transaction rejected$|rejection successful/i,
      ),
    ).toHaveCount(0);
  });
});
