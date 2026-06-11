/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (surfaces the recorded Rejection Note on Rejected
 *   rows in READ-ONLY form, alongside the Epic-4 Story-1/2/3 review behaviour)
 *
 * E2E spec for Epic 4, Story 4: Reading why a transaction was rejected.
 *
 * Source of truth: generated-docs/specs/project-brief.md (BR8) and
 * documentation/transactions-api.yaml:
 *   - GET /v1/transactions -> TransactionReadList (each TransactionRead carries a
 *     `UserNote` string; for a Rejected transaction this holds the Rejection Note
 *     recorded at reject time — see R10/BR2/Story-2).
 *
 * Behaviour under test (read-only Rejection Note on /transactions, BR8):
 *   - AC-1: a Rejected transaction displays its Rejection Note (UserNote) in
 *           read-only form — the note text is VISIBLE, but there is NO editable
 *           control bound to it (no textbox / textarea the user can type into).
 *           The note is surfaced via a read-only affordance (e.g. an expandable row
 *           detail or an accessible note disclosure), which this spec opens if the
 *           note is not rendered inline.
 *   - AC-2: Imported and Approved transactions show NO Rejection Note — only
 *           Rejected rows carry a note, proving the note is genuinely tied to the
 *           Rejected terminal state and not echoed onto every row.
 *   - AC-3: BOTH an Approver and an Importer can read a Rejected transaction's note
 *           (the read-only note is a viewing affordance, not an Approver-only
 *           action — BR9 gates mutating actions, not reading). The same assertion
 *           runs under each persona's session.
 *
 * Developer contract: a Rejected row's `UserNote` is rendered read-only on the
 * Transactions table (inline or behind a per-row disclosure such as an expandable
 * detail). There is no input/textarea/contenteditable bound to the note value on
 * the table — Story 2 owns NOTE ENTRY (inside the Reject modal); this story owns
 * NOTE READING. Imported/Approved rows render no note. This story performs NO
 * mutation and issues no approve/reject POST; any disclosure interaction is pure
 * client-side state with no API call.
 *
 * Mocking follows the project default (page-route-with-spec) with the same
 * deliberate extension the Epic-2/3 and Story-1/2/3 specs use (NFR8: the
 * transactions backend is NOT serving these paths during the build): this spec
 * intercepts BOTH the same-origin BFF auth proxy routes (POST /api/auth/login, GET
 * /api/auth/userinfo — built in Epic 1) AND the GET **\/v1/transactions** data
 * call the API client issues to the configured base URL. All response shapes are
 * derived from the OpenAPI spec above, so no live BFF or transactions backend is
 * required. There is NO action endpoint to mock — this story is read-only.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole locator at document scope can therefore be ambiguous under Playwright
 * strict mode, so every locator below is scoped to the table / a specific row.
 *
 * These tests WILL FAIL until the read-only Rejection Note affordance is
 * implemented (TDD red).
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
const TRANSACTIONS_API = '**/v1/transactions**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';

type Persona = 'Importer' | 'Approver';

// ---------------------------------------------------------------------------
// Fixture — one Rejected row carrying a KNOWN, unique Rejection Note (UserNote),
// plus an Imported and an Approved row that carry NO note. Each row has a unique
// Reference so a row locator binds to exactly that row. Shapes follow
// transactions-api.yaml -> TransactionRead (PascalCase).
// ---------------------------------------------------------------------------

/** The Rejected row whose Rejection Note this story surfaces read-only. */
const REJECTED_REFERENCE = 'TXN-REJ-401';
const REJECTED_ID = 4401;

/** The recorded Rejection Note (UserNote) the spec asserts is visible read-only. */
const REJECTION_NOTE = 'Amount does not match supporting document';

/** An Imported row — must show NO Rejection Note (AC-2). */
const IMPORTED_REFERENCE = 'TXN-IMP-402';
const IMPORTED_ID = 4402;

/** An Approved row — must show NO Rejection Note (AC-2). */
const APPROVED_REFERENCE = 'TXN-APR-403';
const APPROVED_ID = 4403;

function row(
  partial: Pick<TransactionRead, 'Id' | 'Reference' | 'Status' | 'UserNote'>,
): TransactionRead {
  return {
    FileLogId: 1,
    FileName: 'transactions_2025_04_30.csv',
    TransactionDate: '2025-04-30 15:00:00',
    AccountNumber: `100000${partial.Id}`,
    // Description deliberately carries NO Reference substring so a Reference
    // locator matches exactly one cell per row (Epic-3/4 fixture convention).
    Description: `Payment entry ${partial.Id}`,
    Amount: 1500.5,
    TransactionType: 'Debit',
    Currency: 'ZAR',
    // UserNote omitted here: it is ALWAYS supplied via ...partial (it is in the
    // Pick above), so a default literal would be an overwritten duplicate (TS2783).
    LastChangedUser: 'John Doe',
    LastChangedDate: '2025-04-30 15:00:00',
    ...partial,
  };
}

/**
 * A list with one Rejected row (carrying the Rejection Note), one Imported row,
 * and one Approved row (both with NO note). Drives AC-1 (note visible on the
 * Rejected row) and AC-2 (no note on Imported/Approved rows).
 */
function noteFixture(): { Transactions: TransactionRead[] } {
  return {
    Transactions: [
      row({
        Id: REJECTED_ID,
        Reference: REJECTED_REFERENCE,
        Status: 'Rejected',
        UserNote: REJECTION_NOTE,
      }),
      row({
        Id: IMPORTED_ID,
        Reference: IMPORTED_REFERENCE,
        Status: 'Imported',
        UserNote: '',
      }),
      row({
        Id: APPROVED_ID,
        Reference: APPROVED_REFERENCE,
        Status: 'Approved',
        UserNote: '',
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Auth + data mocking (mirrors the Story-1/2/3 specs). Read-only story: no
// action endpoint to intercept.
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

/** Drives the login form to sign the given persona in. */
async function signIn(page: Page, persona: Persona) {
  const creds = persona === 'Importer' ? importerUser : approverUser;
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
}

/**
 * Signs the persona in and lands them on /transactions with the note fixture
 * mocked. Returns once the transactions URL is active.
 */
async function openTransactionsAs(
  page: Page,
  persona: Persona,
  opts: { transactionsBody?: unknown } = {},
): Promise<void> {
  const { transactionsBody = noteFixture() } = opts;
  await mockSignedInAs(page, persona);
  await mockTransactions(page, transactionsBody);
  await signIn(page, persona);
  await page.goto(TRANSACTIONS_ROUTE);
  await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}$`));
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

/**
 * The per-row affordance that reveals a Rejected row's read-only note (an
 * expandable detail / note disclosure). Surfaced as a button/link whose
 * accessible name mentions the note or reason; scoped to the row so it binds to
 * exactly that transaction.
 */
const noteDiscloseControlIn = (rowLocator: Locator): Locator =>
  rowLocator.getByRole('button', {
    name: /note|reason|why|rejection|details?/i,
  });

/**
 * Opens the Rejected row's read-only note affordance if the note is not already
 * rendered inline. Returns once the note text is in the DOM. AC-1 allows either
 * an inline read-only note or one behind a per-row disclosure; this keeps the
 * spec robust to whichever the developer chooses without asserting structure.
 */
async function revealRejectionNote(page: Page, rowLocator: Locator) {
  const inlineNote = rowLocator.getByText(REJECTION_NOTE);
  if ((await inlineNote.count()) > 0) {
    return;
  }
  const disclose = noteDiscloseControlIn(rowLocator);
  await expect(disclose).toBeVisible();
  await disclose.click();
}

/**
 * Reads a Rejected transaction's note under the given persona and asserts it is
 * VISIBLE but READ-ONLY: the note text shows, and there is NO editable control
 * (textbox / textarea / contenteditable) carrying the note. Shared by AC-1 and
 * AC-3 (which runs it under each persona).
 */
async function expectRejectionNoteReadableButNotEditable(
  page: Page,
  persona: Persona,
) {
  await openTransactionsAs(page, persona);

  await expect(transactionsTable(page)).toBeVisible();

  const rejectedRow = rowFor(page, REJECTED_REFERENCE);
  await expect(rejectedRow).toBeVisible();

  await revealRejectionNote(page, rejectedRow);

  // The recorded Rejection Note is visible on the Rejected row, rendered as
  // static text (the developer surfaces it as a read-only <p> in the Description
  // cell — see the page's BR8 block).
  const noteText = rejectedRow.getByText(REJECTION_NOTE);
  await expect(noteText).toBeVisible();

  // It is READ-ONLY: the note lives INSIDE the Rejected row, and that row carries
  // NO editable control of any kind — no textbox / textarea / input the user
  // could type a note into, and no contenteditable note region (note ENTRY is
  // Story 2, inside the closed Reject modal — no Reject modal is open here).
  //
  // The check is deliberately scoped to the Rejected ROW, NOT to the whole <main>.
  // The page's Epic-3 filter bar legitimately renders unrelated editable controls
  // outside the table — the two `type="date"` filter inputs ("Date from" / "Date
  // to") surface with ARIA role "textbox", the amount inputs as "spinbutton", the
  // search box as "searchbox". Those filters are not the rejection note and must
  // not be swept into this read-only assertion. Scoping to the row keeps the test
  // honest: were the note ever rendered as an <input>/<textarea>/contenteditable,
  // that control would sit inside the Rejected row and every assertion below would
  // fail — so this still genuinely proves AC-1's "the note cannot be edited".
  await expect(rejectedRow.getByRole('textbox')).toHaveCount(0);
  await expect(rejectedRow.locator('input, textarea, select')).toHaveCount(0);
  await expect(rejectedRow.locator('[contenteditable="true"]')).toHaveCount(0);

  // Belt-and-braces: the note text itself is carried by a non-editable element
  // (a <p>), not by a form control or a contenteditable host.
  await expect(noteText).toHaveJSProperty('tagName', 'P');
}

test.describe('Epic 4, Story 4: Reading why a transaction was rejected', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: a Rejected transaction displays its Rejection Note (UserNote) in
  // read-only form — the note is visible, with no editable control bound to it.
  test('a Rejected transaction shows its Rejection Note read-only, with no editable control', async ({
    page,
  }) => {
    await expectRejectionNoteReadableButNotEditable(page, 'Approver');
  });

  // AC-2: Imported and Approved transactions show NO Rejection Note — only the
  // Rejected row carries a note (the note is tied to the Rejected terminal state).
  test('Imported and Approved transactions show no Rejection Note', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    await expect(transactionsTable(page)).toBeVisible();

    // The Imported row carries no note: no note text, and no note-disclosure
    // affordance to reveal one.
    const importedRow = rowFor(page, IMPORTED_REFERENCE);
    await expect(importedRow).toBeVisible();
    await expect(importedRow.getByText(REJECTION_NOTE)).toHaveCount(0);
    await expect(noteDiscloseControlIn(importedRow)).toHaveCount(0);

    // The Approved row likewise carries no note and no disclosure affordance.
    const approvedRow = rowFor(page, APPROVED_REFERENCE);
    await expect(approvedRow).toBeVisible();
    await expect(approvedRow.getByText(REJECTION_NOTE)).toHaveCount(0);
    await expect(noteDiscloseControlIn(approvedRow)).toHaveCount(0);
  });

  // AC-3 (Approver): an Approver can read a Rejected transaction's note read-only.
  test('an Approver can read a Rejected transaction note read-only', async ({
    page,
  }) => {
    await expectRejectionNoteReadableButNotEditable(page, 'Approver');
  });

  // AC-3 (Importer): an Importer can read a Rejected transaction's note read-only
  // (reading the note is not an Approver-only mutating action — BR9 gates actions,
  // not viewing).
  test('an Importer can read a Rejected transaction note read-only', async ({
    page,
  }) => {
    await expectRejectionNoteReadableButNotEditable(page, 'Importer');
  });
});
