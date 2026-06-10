/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (adds filtering to the Story-1 transactions table)
 *
 * E2E spec for Epic 3, Story 2: Filter & search the transactions, active filter
 * chips + Clear-all, a no-results state distinct from no-data, and deep-link-in
 * from ?fileLogId=&status=.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R7, R18, BR11) and
 * documentation/transactions-api.yaml (TransactionReadList / TransactionRead,
 * GET /v1/transactions — NO query params, so all filtering is client-side) +
 * auth-api.yaml (UserInfoRead / PageRead).
 *
 * Behaviour under test (the real /transactions page, with filtering added):
 *   - AC-1: applying any filter (status, file, date range, amount range,
 *           reference/account search box) narrows the table per R7's rules.
 *   - AC-2: each active filter shows as a chip; Clear-all removes them all at
 *           once, returning the full list (R18).
 *   - AC-3: filters matching nothing -> a no-results message with the active
 *           chips + Clear-all still visible, distinct from the no-data state
 *           ("No transactions yet") (BR11).
 *   - AC-4: opening /transactions?fileLogId=<id>&status=<Status> pre-applies
 *           those as active filters and shows the matching chips. The param
 *           names match buildTransactionsHref (web/src/lib/files/statusCounts.ts:
 *           `fileLogId` + `status`), the Epic-2 file-detail drill-through.
 *
 * Developer contract: the page reads the FULL list via the API client
 * (web/src/lib/api/client.ts -> get('/v1/transactions'), NO params) and filters
 * client-side. Status / File / date-range / amount-range / free-text-on-
 * Reference-and-AccountNumber are the R7 filter set. Active filters render as
 * chips with a single Clear-all; zero matches yields a no-results state that is
 * NOT the "No transactions yet" zero-data copy and KEEPS the chips + Clear-all
 * visible. The deep-link query params are read on mount and pre-seed the filters.
 *
 * Mocking follows the project default (page-route-with-spec) with the same
 * deliberate extension the Epic-2/Story-1 specs use (NFR8: the transactions
 * backend is NOT serving these paths during the build): this spec intercepts
 * BOTH the same-origin BFF auth proxy routes (POST /api/auth/login,
 * GET /api/auth/userinfo — built in Epic 1) AND the data call the API client
 * issues to the configured base URL (GET **\/v1/transactions**). All response
 * shapes are derived from the two OpenAPI specs above, so no live BFF or
 * transactions backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so all
 * table / chip / alert locators below are scoped to the page's main content
 * region (getByRole('main')). Row-existence checks scope to the table itself so
 * a value the active-filter chip echoes (R18) cannot collide with the same value
 * in a data cell.
 *
 * These tests WILL FAIL until filtering is implemented on /transactions (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';
import {
  filterTransactionList,
  FILTER_ROW_COUNT,
  FILTER_STATUS_APPROVED,
  FILTER_STATUS_APPROVED_COUNT,
  FILTER_FILE_LOG_ID,
  FILE_2_ROW_COUNT,
  FILTER_DATE_FROM,
  FILTER_DATE_TO,
  FILTER_DATE_IN_RANGE_COUNT,
  FILTER_AMOUNT_MIN,
  FILTER_AMOUNT_MAX,
  FILTER_AMOUNT_IN_RANGE_COUNT,
  REF_TOKEN,
  REF_TOKEN_REFERENCE,
  ACCOUNT_TOKEN,
  NO_MATCH_TOKEN,
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

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. Both personas can
 * view AND filter Transactions (project-brief §2), so both Pages lists include
 * /transactions. Only the Importer's Pages include /upload.
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
 * the supplied transactions URL (default /transactions, but AC-4 passes the
 * deep-link variant). Returns once the transactions route is active.
 */
async function openTransactionsAs(
  page: Page,
  persona: Persona,
  url: string = TRANSACTIONS_ROUTE,
) {
  await mockSignedInAs(page, persona);
  await mockTransactions(page, filterTransactionList);
  await signIn(page, persona);
  await page.goto(url);
  await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}`));
}

/** The transactions table, scoped to the page's main content region. */
const transactionsTable = (page: Page) =>
  page.getByRole('main').getByRole('table');

/** Data rows = table rows whose reference matches the fixture's TXN-* pattern. */
const dataRows = (page: Page) =>
  transactionsTable(page).getByRole('row').filter({ hasText: /TXN-/ });

/** The active-filter-chip region (R18). Chips render as a labelled group. */
const filterChips = (page: Page) =>
  page.getByRole('main').getByRole('group', { name: /active filters/i });

test.describe('Epic 3, Story 2: Transactions filter & search', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1 (status): the Status filter narrows the table to exactly the Approved rows.
  test('the Status filter narrows the table to the matching status only', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    const main = page.getByRole('main');
    await expect(transactionsTable(page)).toBeVisible();
    // The full fixture is shown before any filter is applied.
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Choose the Status filter -> Approved. The control is a labelled combobox.
    await main
      .getByRole('combobox', { name: /status/i })
      .selectOption(FILTER_STATUS_APPROVED);

    // Exactly the Approved rows remain (2 in the fixture).
    await expect(dataRows(page)).toHaveCount(FILTER_STATUS_APPROVED_COUNT);
    await expect(transactionsTable(page).getByText('TXN-A001')).toBeVisible();
    await expect(transactionsTable(page).getByText('TXN-A002')).toBeVisible();
  });

  // AC-1 (file): the File filter narrows the table to one FileLogId's rows.
  test("the File filter narrows the table to one file's rows", async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    const main = page.getByRole('main');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Filter by the file (FileLogId 2). The File control is a labelled combobox.
    await main
      .getByRole('combobox', { name: /file/i })
      .selectOption(String(FILTER_FILE_LOG_ID));

    await expect(dataRows(page)).toHaveCount(FILE_2_ROW_COUNT);
  });

  // AC-1 (date range): a date-range window keeps only the in-range rows.
  test('the Transaction-Date range filter keeps only in-range rows', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    const main = page.getByRole('main');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Date pickers expose labelled inputs (From / To). Fill the window that the
    // fixture says captures exactly FILTER_DATE_IN_RANGE_COUNT rows.
    await main
      .getByLabel(/date from|from date|start date/i)
      .fill(FILTER_DATE_FROM);
    await main.getByLabel(/date to|to date|end date/i).fill(FILTER_DATE_TO);

    await expect(dataRows(page)).toHaveCount(FILTER_DATE_IN_RANGE_COUNT);
  });

  // AC-1 (amount range): an amount-range window keeps only the in-range rows.
  test('the Amount range filter keeps only in-range rows', async ({ page }) => {
    await openTransactionsAs(page, 'Approver');

    const main = page.getByRole('main');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Amount min/max are labelled numeric inputs. Fill the window that the
    // fixture says captures exactly FILTER_AMOUNT_IN_RANGE_COUNT rows.
    await main
      .getByLabel(/amount from|min amount|amount min/i)
      .fill(String(FILTER_AMOUNT_MIN));
    await main
      .getByLabel(/amount to|max amount|amount max/i)
      .fill(String(FILTER_AMOUNT_MAX));

    await expect(dataRows(page)).toHaveCount(FILTER_AMOUNT_IN_RANGE_COUNT);
  });

  // AC-1 (search box): free-text matches Reference, then separately AccountNumber.
  test('the search box matches a Reference token, then an Account-Number token', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    const main = page.getByRole('main');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    const search = main.getByRole('searchbox', {
      name: /reference|account|search/i,
    });

    // A token present in exactly ONE row's Reference -> only that row remains.
    // The row-presence check is scoped to the table so the active-filter chip
    // echoing the same token (R18) cannot ambiguate the locator.
    await search.fill(REF_TOKEN);
    await expect(dataRows(page)).toHaveCount(1);
    await expect(
      transactionsTable(page).getByText(REF_TOKEN_REFERENCE),
    ).toBeVisible();

    // The same box searches Account Number too: a token in exactly ONE row's
    // AccountNumber (and in no Reference) -> only that row remains.
    await search.fill(ACCOUNT_TOKEN);
    await expect(dataRows(page)).toHaveCount(1);
    await expect(
      transactionsTable(page).getByText(ACCOUNT_TOKEN),
    ).toBeVisible();
  });

  // AC-2: each active filter shows a chip; Clear-all removes them and restores the list.
  test('active filters render chips and Clear-all restores the full list', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    const main = page.getByRole('main');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Apply two distinct filters (Status + File) so there is more than one chip.
    await main
      .getByRole('combobox', { name: /status/i })
      .selectOption(FILTER_STATUS_APPROVED);
    await main
      .getByRole('combobox', { name: /file/i })
      .selectOption(String(FILTER_FILE_LOG_ID));

    // A chip is shown per active filter, scoped to the chip region.
    const chips = filterChips(page);
    await expect(chips).toBeVisible();
    await expect(
      chips.getByText(new RegExp(FILTER_STATUS_APPROVED, 'i')),
    ).toBeVisible();
    await expect(chips.getByText(/file/i)).toBeVisible();

    // Clear-all removes every chip at once and the full fixture returns.
    await main.getByRole('button', { name: /clear all/i }).click();
    await expect(filterChips(page)).toHaveCount(0);
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);
  });

  // AC-3: zero matches -> a no-results state distinct from no-data, chips + Clear-all kept.
  test('zero filter matches shows a no-results state distinct from the no-data state', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Approver');

    const main = page.getByRole('main');
    await expect(dataRows(page)).toHaveCount(FILTER_ROW_COUNT);

    // Search for a token present in NO row -> zero matches.
    await main
      .getByRole('searchbox', { name: /reference|account|search/i })
      .fill(NO_MATCH_TOKEN);

    // No data rows remain.
    await expect(dataRows(page)).toHaveCount(0);

    // The no-results message is shown — and it is NOT the zero-DATA copy (the
    // fixture is non-empty; results are empty only because the filter excludes
    // everything). BR11 keeps these two empty states visually distinct.
    await expect(
      main.getByText(/no .*match|no results|no transactions match/i),
    ).toBeVisible();
    await expect(main.getByText(/no transactions yet/i)).toHaveCount(0);

    // The active chip + Clear-all stay visible so the user can recover (BR11/R18).
    const chips = filterChips(page);
    await expect(chips).toBeVisible();
    await expect(
      main.getByRole('button', { name: /clear all/i }),
    ).toBeVisible();
  });

  // AC-4: deep-link ?fileLogId=&status= pre-applies the filters and shows the chips.
  test('a ?fileLogId=&status= deep-link pre-applies those filters and shows chips', async ({
    page,
  }) => {
    // The param names MUST match buildTransactionsHref (statusCounts.ts):
    // fileLogId + status. This combination (file 2 + Approved) matches exactly
    // the 2 Approved rows, which both belong to file 2 in the fixture.
    const deepLink = `${TRANSACTIONS_ROUTE}?fileLogId=${FILTER_FILE_LOG_ID}&status=${FILTER_STATUS_APPROVED}`;
    await openTransactionsAs(page, 'Approver', deepLink);

    await expect(transactionsTable(page)).toBeVisible();

    // The table is pre-filtered to file 2 AND Approved -> exactly the 2 rows that
    // satisfy both. (FILTER_STATUS_APPROVED_COUNT Approved rows both live in file 2.)
    await expect(dataRows(page)).toHaveCount(FILTER_STATUS_APPROVED_COUNT);
    await expect(transactionsTable(page).getByText('TXN-A001')).toBeVisible();
    await expect(transactionsTable(page).getByText('TXN-A002')).toBeVisible();

    // Both deep-linked filters render as active chips (the file + the status).
    const chips = filterChips(page);
    await expect(chips).toBeVisible();
    await expect(
      chips.getByText(new RegExp(FILTER_STATUS_APPROVED, 'i')),
    ).toBeVisible();
    await expect(chips.getByText(/file/i)).toBeVisible();
  });
});
