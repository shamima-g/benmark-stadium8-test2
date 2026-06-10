/**
 * Story Metadata:
 * - Route: /files/[id]
 * - Target File: web/src/app/(app)/files/[id]/page.tsx
 * - Page Action: create_new (replaces the Epic-2 Story-1 placeholder at this path)
 *
 * E2E spec for Epic 2, Story 3: File Detail — Summary & Status-Count Drill-Through.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R12, BR4, workflow §
 * "File Detail / Summary" lines 258–259, BR4 lines 165 / 205) and
 * documentation/transactions-api.yaml (FileLogList / FileLog, TransactionReadList
 * / TransactionRead) + auth-api.yaml (UserInfoRead / PageRead).
 *
 * Behaviour under test (the shared file-detail page at /files/[id], readable by
 * BOTH the Importer and the Approver — project-brief §2 "Drill into file's
 * transactions ✓ / ✓"):
 *   - AC-1: the page shows the file's name (FileLog.CurrentFileName) + a
 *           current-status badge (FileLog.CurrentStatus) and a summary panel with
 *           four labelled counts — Total, Imported, Approved, Rejected — whose
 *           numbers are derived from this file's transactions (R12).
 *   - AC-2: clicking a status count navigates to that file's transactions filtered
 *           to that status. The agreed link target is the Transactions route with
 *           query params: /transactions?fileLogId=<id>&status=<Status> (R12 +
 *           R7 "filtering the Transactions table by Status and File"). The
 *           Transactions screen is a LATER epic, so the test asserts only the URL
 *           the count links to — not what renders there.
 *   - AC-3: when the file's CurrentStatus is Processing or Uploaded, the detail
 *           view shows a work-in-progress "dataset not yet final" banner (BR4).
 *
 * AC-4 (loading + not-found states) is covered by the Vitest integration test for
 * this story, not here.
 *
 * --- ROUTE-GATING CONTRACT (developer must implement the matching gate change) ---
 * /files/[id] nests under the (app) route group whose client-side gate
 * (web/src/app/(app)/layout.tsx) today authorises a route only on an EXACT match:
 * `grantedRoutes.includes(pathname)`. A dynamic path like /files/123 never
 * exact-matches a granted '/files' Page, so today it renders the permission-denied
 * banner for everyone. This story makes file detail reachable for BOTH roles.
 *
 * Agreed contract (assumed by this spec — implement to match):
 *   1. The BFF userinfo payload grants both personas a Page whose Route is the
 *      FILE-DETAIL PREFIX '/files' (see FILE_DETAIL_ROUTE_PREFIX below).
 *   2. The (app) gate is updated so a granted '/files' authorises any '/files/<id>'
 *      (prefix authorisation for the file-detail surface), so file-detail CONTENT
 *      renders rather than the denial banner.
 * The fixtures + navigation below set up exactly that grant and assert the
 * file-detail content renders (never the denial banner). If the gate is not yet
 * prefix-aware, these tests fail at the content assertions — which is the intended
 * TDD-red signal pointing the developer at the gate change.
 *
 * --- MOCKING (page-route-with-spec + NFR8) ---
 * NFR8: the transactions backend is NOT serving these paths during the build, so
 * this spec intercepts BOTH the same-origin BFF auth proxy routes (POST
 * /api/auth/login, GET /api/auth/userinfo — built in Epic 1) AND the data calls
 * the page issues to the configured base URL:
 *   - GET **\/v1/file-logs**     -> FileLogList; the page selects the row by Id
 *     (transactions-api.yaml exposes no single-file GET, so the page reads the list
 *     and selects by Id — consistent with the Story-1 dashboard contract).
 *   - GET **\/v1/transactions**  -> TransactionReadList with a MIX of statuses for
 *     the target FileLogId, so the Total/Imported/Approved/Rejected counts are
 *     non-trivial. The page filters by TransactionRead.FileLogId client-side.
 * All response shapes are derived from the OpenAPI specs above, so no live BFF or
 * transactions backend is required. This matches the project default
 * (page-route-with-spec); the data-call interception is the documented NFR8
 * extension, identical to the Story-1 dashboard spec.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so the
 * WIP-banner locator below is scoped to the page's main content region.
 *
 * These tests WILL FAIL until /files/[id] is implemented and the gate is made
 * prefix-aware for file detail (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
// The API client issues these to the configured base URL. Match the path on any
// origin so the intercept holds regardless of how NEXT_PUBLIC_API_BASE_URL resolves.
const FILE_LOGS_API = '**/v1/file-logs**';
const TRANSACTIONS_API = '**/v1/transactions**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';
/** The file-detail surface route prefix the userinfo grant + gate key off (see contract above). */
const FILE_DETAIL_ROUTE_PREFIX = '/files';

/** The target file the detail page is opened for throughout the suite. */
const TARGET_FILE_ID = 7;
const TARGET_FILE_NAME = 'transactions_007.csv';

type Persona = 'Importer' | 'Approver';

/**
 * A FileLog row (transactions-api.yaml FileLog, PascalCase). CurrentFileName is
 * the header name source and CurrentStatus drives the status badge / WIP banner.
 * `status` defaults to a terminal-ish, non-WIP value so the summary panel is the
 * focus unless a test asks for a Processing/Uploaded file (AC-3).
 */
function makeFileLog(id: number, name: string, status = 'Imported') {
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

/**
 * A FileLogList containing the target file (at the given status) plus an unrelated
 * decoy row, so the page must select by Id rather than just take the first row.
 */
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
  const ref = `TXN-${String(id).padStart(5, '0')}`;
  return {
    Id: id,
    FileLogId: fileLogId,
    FileName: TARGET_FILE_NAME,
    Reference: ref,
    TransactionDate: '2025-04-30 15:00:00',
    AccountNumber: '1234567890',
    Description: `Payment for invoice ${id}`,
    Amount: 100 * id,
    TransactionType: id % 2 === 0 ? 'Credit' : 'Debit',
    Currency: 'ZAR',
    Status: status,
    UserNote: status === 'Rejected' ? 'Amount does not match document' : '',
    LastChangedUser: 'John Doe',
    LastChangedDate: '2025-04-30 15:00:00',
  };
}

/**
 * The expected per-status counts for the target file. The summary panel must
 * compute these from the target file's transactions (TransactionRead.FileLogId
 * === TARGET_FILE_ID), ignoring transactions that belong to OTHER files.
 *   Imported: 3, Approved: 2, Rejected: 1  ->  Total: 6
 * These numbers are deliberately distinct so an assertion on one count cannot pass
 * by accidentally reading another.
 */
const EXPECTED_COUNTS = { Total: 6, Imported: 3, Approved: 2, Rejected: 1 };

/**
 * A TransactionReadList for the target file: 3 Imported + 2 Approved + 1 Rejected,
 * PLUS two transactions belonging to a DIFFERENT file (FileLogId 1) that must be
 * excluded from the target file's counts (proves client-side filter by FileLogId).
 */
function transactionsForTargetFile() {
  const target = [
    makeTransaction(101, TARGET_FILE_ID, 'Imported'),
    makeTransaction(102, TARGET_FILE_ID, 'Imported'),
    makeTransaction(103, TARGET_FILE_ID, 'Imported'),
    makeTransaction(104, TARGET_FILE_ID, 'Approved'),
    makeTransaction(105, TARGET_FILE_ID, 'Approved'),
    makeTransaction(106, TARGET_FILE_ID, 'Rejected'),
  ];
  // Decoys for another file — these must NOT be counted toward the target's summary.
  const otherFile = [
    makeTransaction(201, 1, 'Imported'),
    makeTransaction(202, 1, 'Rejected'),
  ];
  return { Transactions: [...target, ...otherFile] };
}

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. Both personas can
 * View Dashboard / Transactions and DRILL INTO A FILE'S TRANSACTIONS
 * (project-brief §2), so both Pages lists include the file-detail prefix '/files'
 * — the grant that (per the route-gating contract above) authorises /files/<id>.
 * Only the Importer's Pages include /upload (BR10 / §2: upload is Importer-only).
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

/** Drives the login form to sign the given persona in. */
async function signIn(page: Page, persona: Persona) {
  const creds = persona === 'Importer' ? importerUser : approverUser;
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
}

/**
 * Signs the persona in, mocks the data, then navigates directly to the target
 * file-detail route. Returns once the /files/<id> URL is active. The target
 * file's CurrentStatus defaults to a non-WIP value; pass `targetStatus` to model
 * a Processing/Uploaded file for AC-3.
 */
async function openFileDetailAs(
  page: Page,
  persona: Persona,
  targetStatus = 'Imported',
) {
  await mockSignedInAs(page, persona);
  await mockData(
    page,
    fileLogListWith(targetStatus),
    transactionsForTargetFile(),
  );
  await signIn(page, persona);
  await page.goto(`${FILE_DETAIL_ROUTE_PREFIX}/${TARGET_FILE_ID}`);
  await expect(page).toHaveURL(
    new RegExp(`${FILE_DETAIL_ROUTE_PREFIX}/${TARGET_FILE_ID}$`),
  );
}

/** The page's main content region — scopes locators off the body-level route announcer. */
const main = (page: Page) => page.getByRole('main');

test.describe('Epic 2, Story 3: File Detail — Summary & Status-Count Drill-Through', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: file name + status badge + the four labelled counts with correct numbers.
  // Run for both personas, since file detail is a shared (Importer + Approver) surface.
  for (const persona of ['Importer', 'Approver'] as const) {
    test(`shows the file name, status badge, and Total/Imported/Approved/Rejected counts (${persona})`, async ({
      page,
    }) => {
      await openFileDetailAs(page, persona, 'Imported');

      const content = main(page);

      // File header: the file's name (CurrentFileName) and its current-status badge.
      await expect(content.getByText(TARGET_FILE_NAME)).toBeVisible();
      // The status badge carries the file's CurrentStatus text (colour is paired
      // with a text label per the brief's badge mapping — assert the label).
      await expect(
        content.getByText('Imported', { exact: false }).first(),
      ).toBeVisible();

      // The summary panel exposes four labelled counts. Each count is reachable by
      // its accessible label and carries the number derived from THIS file's
      // transactions (decoys for other files are excluded).
      const summary = content.getByRole('region', {
        name: /summary|status counts|file summary/i,
      });
      await expect(summary).toBeVisible();

      for (const [label, value] of Object.entries(EXPECTED_COUNTS)) {
        // The labelled count control (a link for the drillable statuses, a static
        // figure for Total). Match the label and assert the visible number.
        const count = summary
          .getByRole('link', { name: new RegExp(label, 'i') })
          .or(summary.getByText(new RegExp(`${label}`, 'i')))
          .first();
        await expect(count).toBeVisible();
        await expect(count).toContainText(String(value));
      }
    });
  }

  // AC-2: clicking a status count navigates to that file's transactions filtered
  // to that status (/transactions?fileLogId=<id>&status=<Status>).
  test("clicking the Imported count navigates to this file's transactions filtered to Imported", async ({
    page,
  }) => {
    await openFileDetailAs(page, 'Approver', 'Imported');

    const summary = main(page).getByRole('region', {
      name: /summary|status counts|file summary/i,
    });

    // The Imported count is an interactive drill-through (link). Clicking it lands
    // on the Transactions route filtered to this file + the Imported status.
    await summary
      .getByRole('link', { name: /imported/i })
      .first()
      .click();

    // AC-2 asserts only the URL the drill-through targets. The Transactions screen
    // is a later epic, so what renders there (a real table, a placeholder, or even
    // the denial banner) is out of scope — only the filtered URL matters here.
    await expect(page).toHaveURL(/\/transactions\?/);
    await expect(page).toHaveURL(
      new RegExp(`fileLogId=${TARGET_FILE_ID}(\\b|&|$)`),
    );
    await expect(page).toHaveURL(/status=Imported(\b|&|$)/i);
  });

  // AC-3: a Processing/Uploaded file shows the "dataset not yet final" WIP banner.
  test('shows the work-in-progress "not yet final" banner when the file is Processing', async ({
    page,
  }) => {
    await openFileDetailAs(page, 'Importer', 'Processing');

    // The WIP banner lives inside the page content. Scope to <main> so it is not
    // conflated with the body-level Next route announcer (also role="alert").
    const banner = main(page).getByRole('alert');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/not yet final/i);
  });

  // AC-3 (companion): an Uploaded file also shows the WIP banner (BR4 names both
  // Processing AND Uploaded as work-in-progress states).
  test('shows the work-in-progress "not yet final" banner when the file is Uploaded', async ({
    page,
  }) => {
    await openFileDetailAs(page, 'Importer', 'Uploaded');

    const banner = main(page).getByRole('alert');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/not yet final/i);
  });
});
