/**
 * Story Metadata:
 * - Route: /transactions
 * - Target File: web/src/app/(app)/transactions/page.tsx
 * - Page Action: modify_existing (replaces the Epic-1 placeholder /transactions page)
 *
 * E2E spec for Epic 3, Story 1: Transactions table — columns, sorting,
 * pagination and read-only view.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R6, R16, R17, BR9,
 * BR11) and documentation/transactions-api.yaml (TransactionReadList /
 * TransactionRead, GET /v1/transactions — NO query params) + auth-api.yaml
 * (UserInfoRead / PageRead).
 *
 * Behaviour under test (the real /transactions table):
 *   - AC-1: the table shows the brief columns (Reference, Transaction Date,
 *           Account, Description, Amount, Currency, Transaction Type, Status)
 *           and a coloured/labelled status badge per row (Status -> badge).
 *   - AC-2: clicking a sortable column header sorts ascending, again descending,
 *           with the active direction indicated via aria-sort (single-column).
 *   - AC-3: pagination is always shown (even for a single page); changing the
 *           rows-per-page (5/10/20/50, default 20) re-pages the table.
 *   - AC-4: an Importer sees the table read-only with NO action controls; an
 *           Approver sees no Reject control either (Reject is Epic 4 Story 2).
 *           The Approver's Approve action is added in Epic 4 Story 1 and is
 *           covered by that story's own spec — not asserted absent here.
 *   - AC-5: the no-data state ("No transactions yet", no creation prompt) is
 *           distinct from a load failure (error message + Retry control); a
 *           loading state is shown while the list is in flight.
 *
 * Developer contract: the table reads the full list via the app's API client
 * (web/src/lib/api/client.ts -> get('/v1/transactions') with NO params), which
 * resolves to `${NEXT_PUBLIC_API_BASE_URL}/v1/transactions`. Status drives the
 * badge. The Reject control (POST /v1/transactions/reject) is Epic 4 Story 2 —
 * it must NOT appear on any row yet.
 *
 * Mocking follows the project default (page-route-with-spec) with the same
 * deliberate extension the Epic-2 specs use (NFR8: the transactions backend is
 * NOT serving these paths during the build): this spec intercepts BOTH the
 * same-origin BFF auth proxy routes (POST /api/auth/login, GET /api/auth/userinfo
 * — built in Epic 1) AND the data call the API client issues to the configured
 * base URL (GET **\/v1/transactions**). All response shapes are derived from the
 * two OpenAPI specs above, so no live BFF or transactions backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so any
 * alert/announcer-prone locator below is scoped to the page's main content
 * region (getByRole('main')).
 *
 * These tests WILL FAIL until the real /transactions table is implemented (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';
import {
  emptyTransactionList,
  makeTransaction,
  transactionList,
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
 * view Transactions (project-brief §2 — both have been granted /transactions),
 * so both Pages lists include /transactions. Only the Importer's Pages include
 * /upload (upload is Importer-only); the Approver's do not.
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
 * Signs the persona in and lands them on /transactions with the supplied list
 * already mocked. Returns once the transactions URL is active.
 */
async function openTransactionsAs(
  page: Page,
  persona: Persona,
  transactionsBody: unknown = transactionList(),
) {
  await mockSignedInAs(page, persona);
  await mockTransactions(page, transactionsBody);
  await signIn(page, persona);
  await page.goto(TRANSACTIONS_ROUTE);
  await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}$`));
}

/** The transactions table, scoped to the page's main content region. */
const transactionsTable = (page: Page) =>
  page.getByRole('main').getByRole('table');

/** Data rows = table rows whose reference matches the generated TXN-### pattern. */
const dataRows = (page: Page) =>
  transactionsTable(page)
    .getByRole('row')
    .filter({ hasText: /TXN-\d+/ });

test.describe('Epic 3, Story 1: Transactions table (read-only)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: the table renders the brief columns and a labelled status badge per row.
  test('shows the brief columns and a status badge per row', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Importer', transactionList());

    const table = transactionsTable(page);
    await expect(table).toBeVisible();

    // The brief's columns are present as column headers (Reference, Transaction
    // Date, Account, Description, Amount, Currency, Transaction Type, Status).
    await expect(
      table.getByRole('columnheader', { name: /reference/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /transaction date/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /account/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /description/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /amount/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /currency/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /transaction type/i }),
    ).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: /status/i }),
    ).toBeVisible();

    // A known Reference is rendered (Reference -> Reference column).
    await expect(table.getByText('TXN-001')).toBeVisible();

    // A status badge is shown on that row — its label is the SAME Status value
    // the fixture generated for row 1 (Status -> labelled badge). Deriving the
    // expectation from makeTransaction(1) keeps the assertion bound to the row it
    // actually produced.
    const expectedStatus = makeTransaction(1).Status;
    const firstRow = table.getByRole('row').filter({ hasText: 'TXN-001' });
    await expect(
      firstRow.getByText(expectedStatus, { exact: false }),
    ).toBeVisible();
  });

  // AC-2: clicking a sortable header sorts asc, again desc, indicated via aria-sort.
  test('clicking the Amount header sorts ascending then descending with aria-sort indicated', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Importer', transactionList());

    const table = transactionsTable(page);
    // The column header is the click target (full-width header button pattern,
    // mirroring the dashboard's sortable headers). Match the columnheader role so
    // the assertion binds to the element that carries aria-sort.
    const header = table.getByRole('columnheader', { name: /amount/i });

    // First click -> ascending. The header advertises the active sort direction
    // via aria-sort (single-column sortable).
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');

    // Capture the first data row's reference under ascending order...
    const firstRefAsc = await dataRows(page)
      .first()
      .getByText(/TXN-\d+/)
      .textContent();

    // Second click -> descending. The aria-sort flips, proving single-column sort
    // toggles direction on repeated header activation.
    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');

    // ...and the first data row's reference differs under descending Amount order
    // (amounts are not monotonic with the reference's lexical order, so the top
    // row by Amount changes when the direction flips).
    const firstRefDesc = await dataRows(page)
      .first()
      .getByText(/TXN-\d+/)
      .textContent();
    expect(firstRefDesc).not.toBe(firstRefAsc);
  });

  // AC-3: pagination is always shown; changing the rows-per-page re-pages the table.
  test('always shows pagination and re-pages when the rows-per-page changes', async ({
    page,
  }) => {
    // 25 rows, default page size 20 -> page 1 shows 20 data rows.
    await openTransactionsAs(page, 'Importer', transactionList(25));

    const table = transactionsTable(page);
    await expect(table).toBeVisible();

    // Pagination control is present (always shown, even when one page would do).
    const pagination = page
      .getByRole('main')
      .getByRole('navigation', { name: /pagination/i });
    await expect(pagination).toBeVisible();

    // Default page size is 20: exactly 20 data rows on page 1.
    await expect(dataRows(page)).toHaveCount(20);

    // Change the rows-per-page to 5 -> the table re-pages to at most 5 data rows.
    await page
      .getByRole('main')
      .getByRole('combobox', { name: /rows per page|page size/i })
      .selectOption('5');
    await expect(dataRows(page)).toHaveCount(5);
  });

  // AC-4 (Importer): no Approve/Reject controls — the Importer's view is fully
  // read-only (BR9 — action controls are Approver-only and HIDDEN for Importers).
  test('an Importer sees no Approve or Reject control on any row', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Importer', transactionList(25));

    const main = page.getByRole('main');
    await expect(transactionsTable(page)).toBeVisible();

    // The Importer read-only invariant: no Approve or Reject row action anywhere.
    await expect(
      main.getByRole('button', { name: /approve|reject/i }),
    ).toHaveCount(0);
    await expect(
      main.getByRole('link', { name: /approve|reject/i }),
    ).toHaveCount(0);
  });

  // AC-4 (Approver): no Reject control yet — Reject is Epic 4 Story 2. (The
  // Approver's Approve action arrives in Epic 4 Story 1 and is covered by that
  // story's spec, so it is NOT asserted absent here.)
  test('an Approver sees no Reject control on any row', async ({ page }) => {
    await openTransactionsAs(page, 'Approver', transactionList(25));

    const main = page.getByRole('main');
    await expect(transactionsTable(page)).toBeVisible();

    // Reject remains unimplemented until Epic 4 Story 2 — it must not appear yet.
    await expect(main.getByRole('button', { name: /reject/i })).toHaveCount(0);
    await expect(main.getByRole('link', { name: /reject/i })).toHaveCount(0);
  });

  // AC-5 (no-data): an empty list reads "No transactions yet" with no creation prompt.
  test('empty list shows "No transactions yet" with no creation prompt', async ({
    page,
  }) => {
    await openTransactionsAs(page, 'Importer', emptyTransactionList);

    const main = page.getByRole('main');

    // The true no-data state — distinct copy, no table rows.
    await expect(main.getByText(/no transactions yet/i)).toBeVisible();

    // The transactions list is read-only and populated by file import (Epic 2),
    // so there is no "create transaction" / "add" prompt on this surface.
    await expect(
      main.getByRole('button', { name: /create|add|new transaction/i }),
    ).toHaveCount(0);
    await expect(
      main.getByRole('link', { name: /create|add|new transaction/i }),
    ).toHaveCount(0);
  });

  // AC-5 (failure): a load failure shows an error message and a Retry control.
  test('a load failure shows an error message and a Retry control', async ({
    page,
  }) => {
    await mockSignedInAs(page, 'Importer');
    // The data call fails with a 500 — the table must surface a recoverable error.
    await page.route(TRANSACTIONS_API, (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          MessageType: 'Error',
          Messages: ['Internal Server Error'],
        }),
      }),
    );
    await signIn(page, 'Importer');
    await page.goto(TRANSACTIONS_ROUTE);
    await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}$`));

    const main = page.getByRole('main');

    // The error state is announced in-page (scoped to <main> to avoid the
    // body-level route announcer) and offers a Retry affordance.
    await expect(main.getByRole('alert')).toBeVisible();
    await expect(
      main.getByRole('button', { name: /retry|try again/i }),
    ).toBeVisible();

    // It is the error state, not the no-data state.
    await expect(main.getByText(/no transactions yet/i)).toHaveCount(0);
  });
});
