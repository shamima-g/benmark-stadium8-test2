/**
 * Story Metadata:
 * - Route: /dashboard
 * - Target File: web/src/app/(app)/dashboard/page.tsx
 * - Page Action: modify_existing (replaces the Epic-1 placeholder dashboard)
 *
 * E2E spec for Epic 2, Story 1: File Logs Dashboard.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R5, R8, R16, R17, R18,
 * BR11) and documentation/transactions-api.yaml (FileLogList / FileLog,
 * GET /v1/file-logs?IsActive=Yes) + auth-api.yaml (UserInfoRead / PageRead).
 *
 * Behaviour under test (the real File Logs list at /dashboard):
 *   - AC-1: the table shows the brief columns (File Name, Process Date,
 *           Record Count, File Status) and a coloured/labelled status badge
 *           per row (CurrentFileName -> File Name, CurrentStatus -> badge).
 *   - AC-2: clicking a column header sorts ascending, again descending, with the
 *           active sort indicated in the header (single-column sort).
 *   - AC-3: pagination is always shown (even for a single page); changing the
 *           page size (5/10/20/50, default 20) re-pages the table.
 *   - AC-4: Status / File Name / Process Date filters narrow the table, each
 *           active filter shows a chip, and Clear-all restores the full list.
 *   - AC-5: the no-data state ("No file logs yet") is distinct from the
 *           zero-filter-results state (chips + Clear-all, no creation prompt);
 *           the Upload prompt in the no-data state is shown only to Importers.
 *   - AC-6: clicking a row opens that file's detail page (/files/[id]).
 *
 * Developer contract (confirmed): the dashboard reads the File Logs list via the
 * app's API client (web/src/lib/api/client.ts -> get('/v1/file-logs', { IsActive:
 * 'Yes' })), which resolves to `${NEXT_PUBLIC_API_BASE_URL}/v1/file-logs`
 * (default http://localhost:8042). CurrentFileName maps to the File Name column
 * and CurrentStatus drives the status badge.
 *
 * The dashboard's zero-data empty state is exposed as a labelled region
 * (role="region", name "No file logs"). The shell's primary navigation (Epic 1)
 * renders an Upload link for an Importer inside the SAME body-level <main>
 * landmark, so the no-data / zero-filter assertions below scope the empty-state
 * Upload CTA to that dashboard region rather than the whole <main> — otherwise the
 * shell's nav Upload link would be conflated with the dashboard's own CTA.
 *
 * Mocking follows the project default (page-route-with-spec) with one deliberate
 * extension noted here: NFR8 means the transactions backend is NOT serving these
 * paths during the build, so this spec intercepts BOTH the same-origin BFF auth
 * proxy routes (POST /api/auth/login, GET /api/auth/userinfo — built in Epic 1)
 * AND the file-logs data call the API client issues to the configured base URL
 * (GET **\/v1/file-logs**). All response shapes are derived from the two OpenAPI
 * specs above, so no live BFF or transactions backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so any
 * alert/announcer-prone locator below is scoped to the page's main content region.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
// The API client issues GET /v1/file-logs to the configured base URL. We match
// the path on any origin (same-origin or the base URL) so the intercept holds
// regardless of how NEXT_PUBLIC_API_BASE_URL is resolved at runtime.
const FILE_LOGS_API = '**/v1/file-logs**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';

type Persona = 'Importer' | 'Approver';

/** A status value drawn from the brief's status vocabulary (CurrentStatus). */
const STATUSES = [
  'Imported',
  'Validated',
  'Approved',
  'Rejected',
  'Failed',
] as const;
type Status = (typeof STATUSES)[number];

/**
 * Builds a FileLog row (transactions-api.yaml FileLog, PascalCase). Only the
 * fields the dashboard reads are populated meaningfully; RecordCount is a STRING
 * per the spec, ProcessDate is an ISO-ish date string, CurrentFileName is the
 * File Name source, CurrentStatus drives the badge.
 */
function makeFileLog(index: number) {
  const status: Status = STATUSES[index % STATUSES.length];
  // Vary names and dates so sort + filter are exercisable; zero-pad the index so
  // lexical and numeric ordering of the visible name diverge predictably.
  const seq = String(index).padStart(3, '0');
  // Spread dates across days so date-range filtering + date sort are meaningful.
  const day = String((index % 28) + 1).padStart(2, '0');
  return {
    Id: index,
    ProcessDate: `2025-04-${day} 09:00:00`,
    SettingId: 1,
    SettingName: 'Daily Transactions',
    ProcessInstanceId: `pi-${seq}`,
    CurrentFolder: '/inbound',
    CurrentFileName: `transactions_${seq}.csv`,
    FileHash: `hash-${seq}`,
    RecordCount: String((index * 7) % 500),
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

/** A populated FileLogList with `count` rows (default 25, enough for pagination). */
function fileLogList(count = 25) {
  return {
    FileLog: Array.from({ length: count }, (_, i) => makeFileLog(i + 1)),
  };
}

/** An empty FileLogList — the true no-data state. */
const emptyFileLogList = { FileLog: [] };

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. Both personas can
 * View Dashboard (project-brief §2), so both Pages lists include /dashboard.
 * Only the Importer's Pages include /upload (BR10 / §2: upload is Importer-only),
 * which is what gates the Upload CTA in the no-data empty state (AC-5).
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

/** Stubs GET /v1/file-logs with the supplied FileLogList body. */
async function mockFileLogs(page: Page, body: unknown) {
  await page.route(FILE_LOGS_API, (route: Route) =>
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
 * Signs the persona in and lands them on /dashboard with the supplied file-logs
 * body already mocked. Returns once the dashboard URL is active.
 */
async function openDashboardAs(
  page: Page,
  persona: Persona,
  fileLogsBody: unknown = fileLogList(),
) {
  await mockSignedInAs(page, persona);
  await mockFileLogs(page, fileLogsBody);
  await signIn(page, persona);
  // Both personas can view the Dashboard; navigate there explicitly so the test
  // is robust to role-specific landing (an Approver lands on Transactions).
  await page.goto(DASHBOARD_ROUTE);
  await expect(page).toHaveURL(new RegExp(`${DASHBOARD_ROUTE}$`));
}

/** The File Logs table, scoped to the page's main content region. */
const fileLogsTable = (page: Page) => page.getByRole('main').getByRole('table');

/**
 * The dashboard's zero-data empty-state region (role="region", name "No file
 * logs"). Scoping empty-state assertions here keeps them off the shell's
 * primary-nav Upload link, which lives in the same body-level <main> landmark.
 */
const noDataRegion = (page: Page) =>
  page.getByRole('region', { name: /no file logs/i });

test.describe('Epic 2, Story 1: File Logs Dashboard', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: the table renders the brief columns and a labelled status badge per row.
  test('shows File Name / Process Date / Record Count / File Status columns and a status badge per row', async ({
    page,
  }) => {
    await openDashboardAs(page, 'Importer', fileLogList());

    const table = fileLogsTable(page);
    await expect(table).toBeVisible();

    // The four brief columns are present as column headers.
    await expect(
      table.getByRole('columnheader', { name: /file name/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /process date/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /record count/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /file status|status/i }),
    ).toBeVisible();

    // A known CurrentFileName is rendered (CurrentFileName -> File Name).
    await expect(table.getByText('transactions_001.csv')).toBeVisible();

    // A status badge is shown for that row — its label is the SAME status value
    // the fixture generated for row 1 (CurrentStatus -> labelled badge). Deriving
    // the expectation from makeFileLog(1) keeps the assertion bound to the row it
    // actually produced (row 1 carries STATUSES[1 % len] = 'Validated'), while
    // still proving a labelled status badge renders on the row.
    const expectedStatus = makeFileLog(1).CurrentStatus;
    const firstRow = table.getByRole('row').filter({
      hasText: 'transactions_001.csv',
    });
    await expect(
      firstRow.getByText(expectedStatus, { exact: false }),
    ).toBeVisible();
  });

  // AC-2: clicking a header sorts asc, again desc, with the active sort indicated.
  test('clicking the File Name header sorts ascending then descending with the active sort indicated', async ({
    page,
  }) => {
    await openDashboardAs(page, 'Importer', fileLogList());

    const table = fileLogsTable(page);
    const header = table.getByRole('columnheader', { name: /file name/i });

    // First click -> ascending. The header advertises the active sort direction
    // via aria-sort (single-column sortable).
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');

    // The first File Name cell after ascending sort is the lexically-smallest
    // visible name. With zero-padded names, 'transactions_001.csv' sorts first.
    const firstCellAsc = table
      .getByRole('row')
      .nth(1)
      .getByText(/transactions_\d+\.csv/);
    await expect(firstCellAsc).toHaveText('transactions_001.csv');

    // Second click -> descending.
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');

    // After descending sort the first visible name is no longer the smallest.
    const firstCellDesc = table
      .getByRole('row')
      .nth(1)
      .getByText(/transactions_\d+\.csv/);
    await expect(firstCellDesc).not.toHaveText('transactions_001.csv');
  });

  // AC-3: pagination is always shown; changing the page size re-pages the table.
  test('always shows pagination and re-pages when the page size changes', async ({
    page,
  }) => {
    // 25 rows, default page size 20 -> page 1 shows 20 data rows.
    await openDashboardAs(page, 'Importer', fileLogList(25));

    const table = fileLogsTable(page);
    await expect(table).toBeVisible();

    // Pagination control is present (always shown, even when one page would do).
    const pagination = page
      .getByRole('main')
      .getByRole('navigation', { name: /pagination/i });
    await expect(pagination).toBeVisible();

    // Default page size is 20: exactly 20 data rows on page 1 (header row excluded).
    const dataRows = () =>
      table.getByRole('row').filter({ hasText: /transactions_\d+\.csv/ });
    await expect(dataRows()).toHaveCount(20);

    // Change the page size to 5 -> the table re-pages to 5 data rows.
    await page
      .getByRole('main')
      .getByRole('combobox', { name: /rows per page|page size/i })
      .selectOption('5');
    await expect(dataRows()).toHaveCount(5);
  });

  // AC-4: filters narrow the table, each active filter shows a chip, Clear-all restores it.
  test('filters narrow the table, show active chips, and Clear-all restores the full list', async ({
    page,
  }) => {
    await openDashboardAs(page, 'Importer', fileLogList(25));

    const main = page.getByRole('main');
    const table = fileLogsTable(page);

    // Apply the File Name filter to a value that matches a single row.
    await main
      .getByRole('textbox', { name: /file name/i })
      .fill('transactions_001.csv');

    // The table narrows to the matching row(s) — 'transactions_001.csv' is unique.
    await expect(table.getByText('transactions_001.csv')).toBeVisible();
    await expect(table.getByText('transactions_002.csv')).toHaveCount(0);

    // An active-filter chip appears naming the applied File Name filter.
    const chip = main
      .getByRole('listitem')
      .filter({ hasText: /transactions_001\.csv/i });
    await expect(chip).toBeVisible();

    // Clear-all removes the chips and restores the full list.
    await main
      .getByRole('button', { name: /clear all|clear filters/i })
      .click();
    await expect(chip).toHaveCount(0);
    await expect(table.getByText('transactions_002.csv')).toBeVisible();
  });

  // AC-5 (Importer): the no-data state is distinct and shows the Upload prompt.
  test('Importer no-data state reads "No file logs yet" and offers an Upload prompt', async ({
    page,
  }) => {
    await openDashboardAs(page, 'Importer', emptyFileLogList);

    const region = noDataRegion(page);

    // The true no-data state — distinct copy, no table rows.
    await expect(region.getByText(/no file logs yet/i)).toBeVisible();

    // Upload prompt is shown for an Importer (BR10 / §2 upload is Importer-only).
    // Scoped to the dashboard's empty-state region so it is the page's OWN CTA,
    // not the shell's primary-nav Upload link in the same <main> landmark.
    await expect(
      region
        .getByRole('link', { name: /upload/i })
        .or(region.getByRole('button', { name: /upload/i })),
    ).toBeVisible();
  });

  // AC-5 (Approver): same no-data state, but NO Upload prompt for a non-Importer.
  test('Approver no-data state shows no Upload prompt', async ({ page }) => {
    await openDashboardAs(page, 'Approver', emptyFileLogList);

    const region = noDataRegion(page);

    await expect(region.getByText(/no file logs yet/i)).toBeVisible();

    // The Approver lacks the upload permission, so no Upload CTA is offered in the
    // dashboard's own empty-state region.
    await expect(region.getByRole('link', { name: /upload/i })).toHaveCount(0);
    await expect(region.getByRole('button', { name: /upload/i })).toHaveCount(
      0,
    );
  });

  // AC-5: a populated list filtered to zero results is DISTINCT from no-data —
  // it keeps the active chips + Clear-all and shows no creation/upload prompt.
  test('zero-filter-results state is distinct from no-data: keeps chips + Clear-all, no creation prompt', async ({
    page,
  }) => {
    await openDashboardAs(page, 'Importer', fileLogList(25));

    const main = page.getByRole('main');

    // Filter to a File Name that matches no row -> zero results, but data exists.
    await main
      .getByRole('textbox', { name: /file name/i })
      .fill('no-such-file-xyz.csv');

    // Distinct empty-results copy — NOT the "No file logs yet" no-data copy.
    await expect(main.getByText(/no file logs yet/i)).toHaveCount(0);
    await expect(
      main.getByText(/no (matching )?(results|files|logs)|no file logs match/i),
    ).toBeVisible();

    // The active-filter chip and Clear-all remain available in this state.
    await expect(
      main.getByRole('listitem').filter({ hasText: /no-such-file-xyz\.csv/i }),
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: /clear all|clear filters/i }),
    ).toBeVisible();

    // No creation/upload prompt in the zero-results state (that belongs to the
    // no-data state). The dashboard renders no empty-state region here, so its own
    // Upload CTA is absent — assert via that region, not the whole <main>, since
    // the shell's primary-nav Upload link is present for an Importer.
    await expect(noDataRegion(page)).toHaveCount(0);
    await expect(
      noDataRegion(page).getByRole('link', { name: /upload/i }),
    ).toHaveCount(0);
  });

  // AC-6: clicking a row opens that file's detail page (/files/[id]).
  test('clicking a row opens that file detail page at /files/[id]', async ({
    page,
  }) => {
    await openDashboardAs(page, 'Importer', fileLogList(25));

    const table = fileLogsTable(page);
    // Row 1 carries Id=1 (makeFileLog index) and CurrentFileName transactions_001.csv.
    const firstRow = table.getByRole('row').filter({
      hasText: 'transactions_001.csv',
    });
    await expect(firstRow).toBeVisible();

    await firstRow.click();

    // Drill-through navigates to the file's detail route with that row's Id.
    await expect(page).toHaveURL(/\/files\/\d+$/);
    await expect(page).toHaveURL(/\/files\/1$/);
  });
});
