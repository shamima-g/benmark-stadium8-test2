/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (adds an Approver-only Export control to the
 *   Story-1 table + Story-2 filters)
 *
 * E2E spec for Epic 3, Story 3: Approver-only CSV export of EXACTLY the
 * currently-filtered transactions.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R11 — export filtered
 * set as CSV named to reflect the active filter + date; BR6 — exported row-set
 * equals the active filter set, Export disabled with a tooltip when zero rows
 * match; BR9 — Approve/Reject and, by extension here, mutating/Approver-only
 * controls are hidden from Importers, who see the table read-only) and
 * documentation/transactions-api.yaml (TransactionReadList / TransactionRead,
 * GET /v1/transactions — NO query params, so filtering AND CSV building are
 * client-side) + auth-api.yaml (UserInfoRead / PageRead).
 *
 * Behaviour under test (the real /transactions page, with Export added):
 *   - AC-1: an Approver sees the Export control in the Transactions toolbar; an
 *           Importer does NOT see it at all (count 0) — BR9 keeps Approver-only
 *           controls hidden, not disabled, for Importers.
 *   - AC-2: as an Approver, applying a Status filter narrows the visible set to a
 *           KNOWN subset (the 2 Approved rows in the fixture); clicking Export
 *           downloads a CSV whose suggested filename reflects the active filter +
 *           a date, and whose body contains EXACTLY the header row + the matching
 *           references and NONE of the excluded references (BR6 + R11).
 *   - AC-3: filters matching nothing -> the Export control is disabled and
 *           carries an explanation (BR6).
 *
 * Developer contract:
 *   - The Export control is a single button in the toolbar, labelled /export/i,
 *     rendered inside the page's main region. It is present only for Approvers.
 *   - Clicking it builds a CSV CLIENT-SIDE from the currently-filtered rows
 *     (same client-side filter set as Story 2) and triggers a browser download
 *     (an <a download> / Blob URL or equivalent), so Playwright observes a
 *     'download' event.
 *   - The CSV's first line is a header row; each subsequent line is one exported
 *     transaction. The Reference value of each exported row appears in the CSV
 *     text; references outside the active filter do NOT. (The assertions below
 *     only require the Reference token to be present/absent per row — the exact
 *     column set and ordering are a vitest concern, AC-4.)
 *   - The download's suggestedFilename reflects the active filter (e.g. the
 *     status) AND a date stamp; the assertion is a permissive regex (a .csv name
 *     containing the active status token and an 8-digit yyyymmdd or
 *     yyyy-mm-dd date) so the developer keeps naming latitude within R11.
 *   - When zero rows match, the button is rendered DISABLED with an explanatory
 *     title / aria-description (BR6's "tooltip when zero rows match").
 *
 * Download-capture assumptions (documented per the orchestrator's request):
 *   - playwright.config.ts must allow downloads (acceptDownloads defaults to true
 *     for the chromium/webkit/firefox projects Playwright ships, so no extra
 *     config is needed). We capture via page.waitForEvent('download') started
 *     BEFORE the click, then read the file through download.path() +
 *     fs.readFileSync — the canonical Playwright pattern. If a future harness
 *     change disables downloads, this spec fails loudly at the waitForEvent
 *     rather than silently passing.
 *   - The CSV is asserted by Reference-token containment (substring), not by
 *     parsing columns, so the test is robust to the developer's exact CSV schema
 *     while still proving BR6 (exactly the filtered rows, nothing else).
 *
 * Mocking follows the project default (page-route-with-spec) with the same
 * deliberate extension the Epic-2/Epic-3 specs use (NFR8: the transactions
 * backend is NOT serving these paths during the build): this spec intercepts
 * BOTH the same-origin BFF auth proxy routes (POST /api/auth/login,
 * GET /api/auth/userinfo — built in Epic 1) AND the data call the API client
 * issues to the configured base URL (GET **\/v1/transactions**). All response
 * shapes are derived from the two OpenAPI specs above, so no live BFF or
 * transactions backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert"; a bare
 * getByRole('alert') is ambiguous under Playwright strict mode. All toolbar /
 * control / table locators below are therefore scoped to the page's main content
 * region (getByRole('main')), matching the Story-2 spec's convention.
 *
 * These tests WILL FAIL until Export is implemented on /transactions (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { importerUser, approverUser } from './fixtures/credentials';
import {
  filterTransactionList,
  FILTER_ROW_COUNT,
  FILTER_STATUS_APPROVED,
  FILTER_STATUS_APPROVED_COUNT,
  NO_MATCH_TOKEN,
  FILTER_ROWS,
} from './fixtures/transactions';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
// The API client issues GET /v1/transactions to the configured base URL. Match
// the path on any origin so the intercept holds regardless of how
// NEXT_PUBLIC_API_BASE_URL is resolved at runtime.
const TRANSACTIONS_API = '**/v1/transactions**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';

type Persona = 'Importer' | 'Approver';

/** The two Approved references the Status filter narrows the fixture down to. */
const APPROVED_REFERENCES = FILTER_ROWS.filter(
  (row) => row.Status === FILTER_STATUS_APPROVED,
).map((row) => row.Reference);

/** Every reference that is NOT Approved — none of these may appear in the export. */
const EXCLUDED_REFERENCES = FILTER_ROWS.filter(
  (row) => row.Status !== FILTER_STATUS_APPROVED,
).map((row) => row.Reference);

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. Both personas can
 * view AND filter Transactions (project-brief §2), so both Pages lists include
 * /transactions. Only the Importer's Pages include /upload. (Export visibility
 * is an Approver-only UI affordance — BR9 — not a separate Page grant.)
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
 * Signs the persona in, mocks the (always full) transactions list, then opens
 * /transactions. Returns once the transactions route is active.
 */
async function openTransactionsAs(page: Page, persona: Persona) {
  await mockSignedInAs(page, persona);
  await mockTransactions(page, filterTransactionList);
  await signIn(page, persona);
  await page.goto(TRANSACTIONS_ROUTE);
  await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}`));
}

/** The transactions table, scoped to the page's main content region. */
const transactionsTable = (page: Page) =>
  page.getByRole('main').getByRole('table');

/** Data rows = table rows whose reference matches the fixture's TXN-* pattern. */
const dataRows = (page: Page) =>
  transactionsTable(page).getByRole('row').filter({ hasText: /TXN-/ });

/** The Approver-only Export control, scoped to the page's main region. */
const exportButton = (page: Page) =>
  page.getByRole('main').getByRole('button', { name: /export/i });

/** The Status filter combobox, scoped to the page's main region (Story-2 shape). */
const statusFilter = (page: Page) =>
  page.getByRole('main').getByRole('combobox', { name: /status/i });

test.describe('Epic 3, Story 3: Approver CSV export of filtered transactions', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: an Approver sees the Export control; an Importer does NOT (BR9).
  test('Export is visible to an Approver and absent for an Importer', async ({
    page,
  }) => {
    // Approver: the Export control is present in the toolbar.
    await openTransactionsAs(page, 'Approver');
    await expect(transactionsTable(page)).toBeVisible();
    await expect(exportButton(page)).toBeVisible();

    // Fresh session as an Importer: same table, but NO Export control at all
    // (BR9 hides Approver-only controls rather than disabling them).
    await page.context().clearCookies();
    await openTransactionsAs(page, 'Importer');
    await expect(transactionsTable(page)).toBeVisible();
    await expect(exportButton(page)).toHaveCount(0);
  });

  // AC-2: Export downloads a CSV of EXACTLY the filtered rows, with a filter+date
  // filename (R11, BR6).
  test('Export downloads a CSV of exactly the filtered rows with a filter+date filename', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Narrow to a KNOWN subset: the Approved rows (TXN-A001, TXN-A002).
    await statusFilter(page).selectOption(FILTER_STATUS_APPROVED);
    await expect(dataRows(page)).toHaveCount(FILTER_STATUS_APPROVED_COUNT);

    // Capture the download fired by the Export click.
    const downloadPromise = page.waitForEvent('download');
    await exportButton(page).click();
    const download = await downloadPromise;

    // Filename reflects the active filter (the status token) AND a date stamp.
    // Permissive: a .csv name carrying the status token and a yyyymmdd or
    // yyyy-mm-dd date, in either order, keeps the developer naming latitude (R11).
    const filename = download.suggestedFilename();
    expect(filename).toMatch(
      new RegExp(
        `(?=.*${FILTER_STATUS_APPROVED.toLowerCase()})(?=.*\\d{4}-?\\d{2}-?\\d{2}).*\\.csv$`,
        'i',
      ),
    );

    // Read the downloaded file and assert its CONTENT (BR6: exactly the filtered
    // set). The canonical Playwright pattern: download.path() resolves to the
    // saved temp file once the download completes.
    const path = await download.path();
    expect(path).not.toBeNull();
    const csv = readFileSync(path as string, 'utf8');

    // A header row + one line per exported transaction => header + the 2 matches.
    const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
    expect(lines).toHaveLength(FILTER_STATUS_APPROVED_COUNT + 1);

    // Every Approved reference is present...
    for (const ref of APPROVED_REFERENCES) {
      expect(csv).toContain(ref);
    }
    // ...and NO reference outside the active filter leaks into the export.
    for (const ref of EXCLUDED_REFERENCES) {
      expect(csv).not.toContain(ref);
    }
  });

  // AC-3: zero matching rows -> Export is disabled and explains why (BR6).
  test('Export is disabled with an explanation when no rows match the filter', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Search for a token present in NO row -> zero matches.
    await page
      .getByRole('main')
      .getByRole('searchbox', { name: /reference|account|search/i })
      .fill(NO_MATCH_TOKEN);
    await expect(dataRows(page)).toHaveCount(0);

    // The Export control is rendered but DISABLED (BR6: not removed, so the user
    // can see why export is unavailable).
    const exportBtn = exportButton(page);
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeDisabled();

    // It carries an explanation of why it is disabled — via an accessible
    // description (title / aria-describedby surfaced as the accessible
    // description) mentioning the zero-match reason.
    await expect(exportBtn).toHaveAccessibleDescription(
      /no .*match|nothing to export|no transactions|no rows/i,
    );
  });
});
