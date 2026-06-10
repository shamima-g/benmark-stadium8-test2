/**
 * Story Metadata:
 * - Route: /files/[id]
 * - Target File: web/src/app/(app)/files/[id]/page.tsx
 * - Page Action: modify_existing (adds Importer-only lifecycle controls to the
 *   Story-3 file-detail page)
 *
 * E2E spec for Epic 2, Story 4: File Lifecycle — Validation Errors, Retry &
 * Cancel (Importer).
 *
 * Source of truth: generated-docs/specs/project-brief.md (R13 retry validation,
 * R14 validation-errors view, R15 cancel file, BR5, BR7 "cancel is blocked once
 * any transaction for the file is Approved", BR10 "lifecycle controls are
 * Importer-only / hidden from Approvers") and documentation/transactions-api.yaml.
 *
 * Behaviour under test — Importer-only mutating controls layered onto the shared
 * /files/[id] detail page built in Story 3:
 *   - AC-1: for a Failed file, the Importer sees the invalid rows + the column
 *           headings (from the validation-errors grid) and a Retry Validation
 *           control; retrying re-runs processing and the displayed File Status
 *           updates.
 *   - AC-2: the Importer can Cancel the file via a confirmation modal that NAMES
 *           the file and defaults focus to the Cancel/dismiss action; confirming
 *           fires DELETE /v1/files and removes the file.
 *   - AC-3: when the file has >= 1 Approved transaction (BR7), clicking Cancel is
 *           BLOCKED — an explanatory banner is shown INSTEAD of the modal.
 *   - AC-4: an Approver viewing the same file sees NONE of the lifecycle controls
 *           (no Retry Validation, no Cancel, no validation-error retry) — BR10.
 *
 * --- DATA MODEL (inherited from Story 3) ---
 * transactions-api.yaml exposes no single-file GET, so the page reads the full
 * GET /v1/file-logs list and selects the row by Id, and reads the full
 * GET /v1/transactions list and filters by TransactionRead.FileLogId client-side.
 * The BR7 "any Approved transaction?" check that gates Cancel is the documented
 * client-side derivation over that transactions list (epic overview "Spec gaps").
 *
 * --- MOCKING (page-route-with-spec + NFR8) ---
 * NFR8: neither the BFF nor the transactions backend serves these paths during the
 * build, so this spec intercepts the same-origin BFF auth proxy routes (POST
 * /api/auth/login, GET /api/auth/userinfo — Epic 1) AND the data + lifecycle calls
 * the page issues to the configured base URL. All response shapes are derived from
 * documentation/transactions-api.yaml:
 *   - GET    **\/v1/file-logs**                      -> FileLogList
 *   - GET    **\/v1/transactions**                   -> TransactionReadList
 *   - GET    **\/v1/files/validation-errors**        -> ValidationErrors
 *            ({ ValidationErrors: { JsonArray: "<JSON-array STRING>" } })
 *   - GET    **\/v1/files/validation-errors/columns**-> ColumnList
 *   - POST   **\/v1/files/retry-validation**         -> DefaultResponse (200)
 *   - DELETE **\/v1/files**                          -> DefaultResponse (200)
 * This matches the project default (page-route-with-spec); the data-call
 * interception is the documented NFR8 extension, identical to the Story-1/3 specs.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert", so bare
 * getByRole('alert') is ambiguous under Playwright strict mode. The blocked-cancel
 * banner locator below is therefore scoped to the page's <main> content region,
 * and the confirmation modal is matched via getByRole('alertdialog')/('dialog').
 *
 * These tests WILL FAIL until the Importer-only lifecycle controls are implemented
 * on /files/[id] (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
const FILE_LOGS_API = '**/v1/file-logs**';
const TRANSACTIONS_API = '**/v1/transactions**';
// validation-errors/columns is a more specific path than validation-errors, so it
// must be registered AFTER (Playwright matches the most-recently-added route first).
const VALIDATION_ERRORS_API = '**/v1/files/validation-errors?**';
const VALIDATION_COLUMNS_API = '**/v1/files/validation-errors/columns**';
const RETRY_VALIDATION_API = '**/v1/files/retry-validation**';
// DELETE /v1/files must not also swallow the upload/download sub-paths; match the
// files collection endpoint with a query string (the delete call carries ?LogId=).
const FILES_DELETE_API = '**/v1/files?**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';
const FILE_DETAIL_ROUTE_PREFIX = '/files';

/** The target file the detail page is opened for throughout the suite. */
const TARGET_FILE_ID = 7;
const TARGET_FILE_NAME = 'transactions_007.csv';

type Persona = 'Importer' | 'Approver';

/** A FileLog row (transactions-api.yaml FileLog, PascalCase). */
function makeFileLog(id: number, name: string, status: string) {
  const seq = String(id).padStart(3, '0');
  return {
    Id: id,
    ProcessDate: '2025-04-30 09:00:00',
    SettingId: 1,
    SettingName: 'Daily Transactions',
    ProcessInstanceId: `pi-${seq}`,
    CurrentFolder: '/inbound',
    CurrentFileName: name,
    FileHash: `hash-${seq}`,
    RecordCount: '6',
    Direction: 'Inbound',
    CurrentStatus: status,
    LastExecutedActivityName: 'Validate',
    ProcessDefinitionId: 'pd-1',
    ProcessName: 'Transaction Import',
    IsActive: true,
    BulkErrorFile: '',
    HasBulkErrorFile: 'No',
  };
}

/** A FileLogList containing the target file (at the given status) plus a decoy row. */
function fileLogListWith(targetStatus: string) {
  return {
    FileLog: [
      makeFileLog(1, 'transactions_001.csv', 'Completed'),
      makeFileLog(TARGET_FILE_ID, TARGET_FILE_NAME, targetStatus),
    ],
  };
}

/** A TransactionRead row (transactions-api.yaml TransactionRead, PascalCase). */
function makeTransaction(id: number, fileLogId: number, status: string) {
  return {
    Id: id,
    FileLogId: fileLogId,
    FileName: TARGET_FILE_NAME,
    Reference: `TXN-${String(id).padStart(5, '0')}`,
    TransactionDate: '2025-04-30 15:00:00',
    AccountNumber: '1234567890',
    Description: `Payment for invoice ${id}`,
    Amount: 100 * id,
    TransactionType: id % 2 === 0 ? 'Credit' : 'Debit',
    Currency: 'ZAR',
    Status: status,
    UserNote: '',
    LastChangedUser: 'John Doe',
    LastChangedDate: '2025-04-30 15:00:00',
  };
}

/**
 * A TransactionReadList for the target file whose transactions are all NON-Approved
 * (Imported only). With no Approved transaction, BR7 does NOT block Cancel, so the
 * confirmation modal is reachable (AC-2).
 */
function transactionsNoneApproved() {
  return {
    Transactions: [
      makeTransaction(101, TARGET_FILE_ID, 'Imported'),
      makeTransaction(102, TARGET_FILE_ID, 'Imported'),
      // Decoy belonging to a different file — excluded from the BR7 check.
      makeTransaction(201, 1, 'Approved'),
    ],
  };
}

/**
 * A TransactionReadList where the target file has at least one Approved transaction.
 * Per BR7 this must BLOCK Cancel (AC-3). The Approved decoy on file 1 is irrelevant;
 * it is transaction 103 on the TARGET file that triggers the block.
 */
function transactionsWithApproved() {
  return {
    Transactions: [
      makeTransaction(101, TARGET_FILE_ID, 'Imported'),
      makeTransaction(103, TARGET_FILE_ID, 'Approved'),
    ],
  };
}

/**
 * Validation-error rows for the Failed file, returned (per the OpenAPI
 * ValidationErrors schema) as a JSON-encoded STRING inside ValidationErrors.JsonArray.
 * The page must JSON.parse this string and render the rows in the grid.
 *
 * INVALID_ROW_2's Error message is phrased so it does NOT contain the substring
 * "account number": the grid renders a column whose HeaderText is "Account Number",
 * and Playwright's getByText does a case-insensitive substring match, so an error
 * message mentioning the account number would have collided with that header and
 * made the AC-1 column-heading assertion ambiguous under strict mode.
 */
const INVALID_ROW_1 = {
  Reference: 'TXN-90001',
  AccountNumber: '0000000001',
  Amount: 'NaN',
  Error: 'Amount is not a valid number',
};
const INVALID_ROW_2 = {
  Reference: 'TXN-90002',
  AccountNumber: '',
  Amount: '250.00',
  Error: 'A required value is missing',
};

function validationErrorsBody() {
  return {
    ValidationErrors: {
      JsonArray: JSON.stringify([INVALID_ROW_1, INVALID_ROW_2]),
    },
  };
}

/**
 * Column metadata (transactions-api.yaml ColumnList) for the validation-errors grid.
 * HeaderText is the user-visible column heading the grid must render (AC-1).
 */
function validationColumnsBody() {
  return {
    ColumnList: [
      {
        Name: 'Reference',
        HeaderText: 'Reference',
        Visible: true,
        CellAlignment: 'left',
        CellDisplay: 'text',
        Classes: 'col-reference',
      },
      {
        Name: 'AccountNumber',
        HeaderText: 'Account Number',
        Visible: true,
        CellAlignment: 'left',
        CellDisplay: 'text',
        Classes: 'col-account',
      },
      {
        Name: 'Amount',
        HeaderText: 'Amount',
        Visible: true,
        CellAlignment: 'right',
        CellDisplay: 'number',
        Classes: 'col-amount',
      },
      {
        Name: 'Error',
        HeaderText: 'Validation Error',
        Visible: true,
        CellAlignment: 'left',
        CellDisplay: 'text',
        Classes: 'col-error',
      },
    ],
  };
}

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona — same grant model as
 * Story 3: both personas can drill into a file's transactions (Pages include the
 * '/files' detail prefix); only the Importer's Pages include '/upload'. The
 * lifecycle controls are gated in-page by RolesString (BR10), not by routing.
 */
function userInfoFor(persona: Persona) {
  const sharedPages = [
    { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
    { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
    { Id: 4, Name: 'File detail', Route: FILE_DETAIL_ROUTE_PREFIX },
  ];
  const pages =
    persona === 'Importer'
      ? [...sharedPages, { Id: 3, Name: 'Upload', Route: UPLOAD_ROUTE }]
      : sharedPages;

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

/** Stubs GET /v1/file-logs and GET /v1/transactions with the supplied bodies. */
async function mockData(
  page: Page,
  fileLogsBody: unknown,
  transactionsBody: unknown,
) {
  await page.route(FILE_LOGS_API, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileLogsBody),
    }),
  );
  await page.route(TRANSACTIONS_API, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(transactionsBody),
    }),
  );
}

/**
 * Stubs the validation-errors grid endpoints. The /columns route is registered
 * AFTER the rows route so Playwright's most-recent-first matching resolves the
 * more-specific columns path correctly even though both share the
 * /v1/files/validation-errors prefix.
 */
async function mockValidationErrorGrid(page: Page) {
  await page.route(VALIDATION_ERRORS_API, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(validationErrorsBody()),
    }),
  );
  await page.route(VALIDATION_COLUMNS_API, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(validationColumnsBody()),
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

/** The page's main content region — scopes locators off the body-level route announcer. */
const main = (page: Page) => page.getByRole('main');

/** The Retry Validation control (button or link, case-insensitive). */
const retryValidationControl = (page: Page) =>
  main(page).getByRole('button', { name: /retry validation/i });

/** The Cancel File control (the destructive lifecycle trigger, not a modal dismiss). */
const cancelFileControl = (page: Page) =>
  main(page).getByRole('button', { name: /cancel file/i });

/**
 * Signs the persona in, wires the data + (optionally) the validation grid mocks,
 * then navigates to the target file-detail route. The target file's CurrentStatus
 * is supplied per scenario.
 */
async function openFileDetailAs(
  page: Page,
  persona: Persona,
  opts: {
    targetStatus: string;
    transactionsBody: unknown;
    withValidationGrid?: boolean;
  },
) {
  await mockSignedInAs(page, persona);
  await mockData(
    page,
    fileLogListWith(opts.targetStatus),
    opts.transactionsBody,
  );
  if (opts.withValidationGrid) {
    await mockValidationErrorGrid(page);
  }
  await signIn(page, persona);
  await page.goto(`${FILE_DETAIL_ROUTE_PREFIX}/${TARGET_FILE_ID}`);
  await expect(page).toHaveURL(
    new RegExp(`${FILE_DETAIL_ROUTE_PREFIX}/${TARGET_FILE_ID}$`),
  );
}

test.describe('Epic 2, Story 4: File Lifecycle — Validation Errors, Retry & Cancel (Importer)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: a Failed file shows the validation-errors grid (column headings + invalid
  // rows) and a Retry Validation control; retrying re-runs validation and the
  // displayed File Status updates.
  test('Importer sees the validation-errors grid + Retry Validation, and retry updates the File Status', async ({
    page,
  }) => {
    await openFileDetailAs(page, 'Importer', {
      targetStatus: 'Failed',
      transactionsBody: transactionsNoneApproved(),
      withValidationGrid: true,
    });

    const content = main(page);

    // Column headings come from the ColumnList HeaderText values.
    await expect(content.getByText('Account Number')).toBeVisible();
    await expect(content.getByText('Validation Error')).toBeVisible();
    // The invalid rows (parsed from ValidationErrors.JsonArray) render their cells.
    await expect(content.getByText(INVALID_ROW_1.Reference)).toBeVisible();
    await expect(content.getByText(INVALID_ROW_1.Error)).toBeVisible();
    await expect(content.getByText(INVALID_ROW_2.Error)).toBeVisible();

    // The Failed status is reflected before retry.
    await expect(
      content.getByText('Failed', { exact: false }).first(),
    ).toBeVisible();

    // Retry Validation control is present for the Importer.
    const retry = retryValidationControl(page);
    await expect(retry).toBeVisible();

    // After retry fires, the page re-reads status. Model the backend transitioning
    // the file to Processing: the retry POST succeeds, and the subsequent file-logs
    // read now reports the new status. Re-register file-logs (most-recent wins) so
    // the post-retry re-fetch reflects Processing.
    let retryFired = false;
    await page.route(RETRY_VALIDATION_API, (route: Route) => {
      retryFired = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Messages: ['Validation retry started'] }),
      });
    });
    await page.route(FILE_LOGS_API, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fileLogListWith('Processing')),
      }),
    );

    await retry.click();

    // The retry endpoint was invoked and the displayed File Status moved off Failed
    // to the re-running (Processing) state.
    await expect.poll(() => retryFired).toBe(true);
    await expect(
      content.getByText('Processing', { exact: false }).first(),
    ).toBeVisible();
  });

  // AC-2: Cancel via a confirmation modal that NAMES the file with default focus on
  // the Cancel/dismiss action; confirming fires DELETE /v1/files and removes the file.
  test('Importer cancels via a confirmation modal that names the file (default focus on dismiss); confirming deletes it', async ({
    page,
  }) => {
    await openFileDetailAs(page, 'Importer', {
      targetStatus: 'Imported',
      transactionsBody: transactionsNoneApproved(),
    });

    let deleteFired = false;
    await page.route(FILES_DELETE_API, async (route: Route) => {
      if (route.request().method() === 'DELETE') {
        deleteFired = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ Messages: ['File cancelled'] }),
        });
      }
      return route.fallback();
    });

    // Open the destructive confirmation.
    await cancelFileControl(page).click();

    // A modal dialog appears and NAMES the file being cancelled.
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(TARGET_FILE_NAME);

    // Default focus is the safe dismiss action (the modal's "Cancel"/"Keep file"
    // button), not the destructive confirm — guards against accidental deletion.
    const dismiss = dialog.getByRole('button', {
      name: /^(cancel|keep|dismiss|no)\b/i,
    });
    await expect(dismiss).toBeFocused();

    // Confirm the destructive action.
    await dialog
      .getByRole('button', { name: /delete|confirm|cancel file|yes/i })
      .click();

    // DELETE fired and the file is removed: the post-cancel UX navigates away from
    // the now-deleted file's detail route (back to the dashboard / file list).
    await expect.poll(() => deleteFired).toBe(true);
    await expect(page).not.toHaveURL(
      new RegExp(`${FILE_DETAIL_ROUTE_PREFIX}/${TARGET_FILE_ID}$`),
    );
  });

  // AC-3: when the file has >= 1 Approved transaction (BR7), Cancel is blocked — an
  // explanatory banner is shown INSTEAD of the confirmation modal.
  test('Cancel is blocked with an explanatory banner (no modal) when the file has an Approved transaction', async ({
    page,
  }) => {
    await openFileDetailAs(page, 'Importer', {
      targetStatus: 'Imported',
      transactionsBody: transactionsWithApproved(),
    });

    // No DELETE should ever fire on a blocked file — fail loudly if it does.
    let deleteFired = false;
    await page.route(FILES_DELETE_API, (route: Route) => {
      if (route.request().method() === 'DELETE') {
        deleteFired = true;
      }
      return route.fallback();
    });

    await cancelFileControl(page).click();

    // The explanatory banner is shown in the page content (scoped off the body-level
    // route announcer) and explains the block.
    const banner = main(page).getByRole('alert');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/approved/i);

    // No confirmation modal appears, and no delete is attempted.
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(deleteFired).toBe(false);
  });

  // AC-4: an Approver viewing the same file sees NONE of the Importer-only lifecycle
  // controls — no Retry Validation, no Cancel, no validation-error retry affordance (BR10).
  test('Approver sees no Retry Validation, no Cancel, and no validation-retry controls', async ({
    page,
  }) => {
    // Use a Failed file so that, were the gating broken, the validation-error retry
    // affordances WOULD be present — making their absence a meaningful assertion.
    await openFileDetailAs(page, 'Approver', {
      targetStatus: 'Failed',
      transactionsBody: transactionsNoneApproved(),
      withValidationGrid: true,
    });

    // The shared read-only detail content still renders for the Approver (proves the
    // page loaded, so the absent controls are a gating result, not a load failure).
    await expect(main(page).getByText(TARGET_FILE_NAME)).toBeVisible();

    // None of the Importer-only lifecycle controls are present for the Approver.
    await expect(
      main(page).getByRole('button', { name: /retry validation/i }),
    ).toHaveCount(0);
    await expect(
      main(page).getByRole('button', { name: /cancel file/i }),
    ).toHaveCount(0);
  });
});
