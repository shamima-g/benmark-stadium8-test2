/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/(app)/layout.tsx
 * - Page Action: create_new
 *
 * E2E spec for Epic 1, Story 3: Role-based landing routing and route protection.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R1 §7, NFR5 §10,
 * §2 role/permission matrix, §9 Authentication workflow) and
 * documentation/auth-api.yaml (UserInfoRead / RoleRead / PageRead shapes).
 *
 * Behaviour under test (the protected `(app)` route group/layout):
 *   - AC-1: after sign-in, an Importer lands on the Dashboard and an Approver
 *           lands on the Transactions screen (role-specific landing — R1 §7,
 *           §9 step 3).
 *   - AC-2: a signed-out user opening any protected route is redirected to the
 *           login screen (§9 step 1, NFR5 — protected access is gated).
 *   - AC-3: a user opening a route their role lacks sees an in-page
 *           permission-denied banner naming the missing permission, NOT a
 *           generic 403 page (project-brief §2 "Denied actions … surfaces an
 *           in-page permission-denied banner naming the missing permission; a
 *           generic 403 error page is not used").
 *   (AC-4 — the role-to-landing mapping unit — is covered by Vitest, not here.)
 *
 * Mocking follows the project default (page-route-with-spec): we intercept the
 * SAME-ORIGIN BFF proxy routes built in Story 1
 * (web/src/app/api/auth/[...route]/route.ts):
 *   - POST /api/auth/login    -> 200 { Messages: ['Login successful'] }
 *   - GET  /api/auth/userinfo -> 200 UserInfoRead (role-specific Roles + Pages)
 * The userinfo body shape is derived from auth-api.yaml (UserInfoRead/RoleRead/
 * PageRead) — the proxy passes the BFF profile through unchanged. Routing logic
 * keys off the user's Roles/Pages (Page.Route), so role names drive the landing
 * (project-brief §13 caveat: the spec example RolesString='Viewer' is a
 * placeholder; the real personas are Importer/Approver per §2). No live BFF is
 * required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so the
 * permission-denied banner is located within the page's main content region.
 *
 * These tests WILL FAIL until the (app) protected layout is implemented (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';

/** Role-specific landing routes (project-brief §2 / R1 §7). */
const DASHBOARD_ROUTE = '/dashboard'; // Importer landing
const TRANSACTIONS_ROUTE = '/transactions'; // Approver landing

type Persona = 'Importer' | 'Approver';

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. The user's Pages
 * list expresses which routes their role may access (PageRead.Route); the
 * landing layer reads Roles/Pages to decide the post-login destination and to
 * gate protected routes. Importer reaches Dashboard; Approver reaches
 * Transactions. Each persona's Pages omits the other role's exclusive route so
 * AC-3 (permission-denied on a role-lacked route) is exercisable.
 */
function userInfoFor(persona: Persona) {
  const pages =
    persona === 'Importer'
      ? [
          { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
          { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
        ]
      : [{ Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE }];

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

/** Drives the login form to submit valid credentials for the given persona. */
async function signIn(page: Page, persona: Persona) {
  const creds = persona === 'Importer' ? importerUser : approverUser;
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
}

/**
 * The in-page permission-denied banner, scoped to the main content region to
 * avoid colliding with App Router's body-level __next-route-announcer__ (also
 * role="alert"). The banner names the missing permission (project-brief §2).
 */
const permissionDeniedBanner = (page: Page) =>
  page.getByRole('main').getByRole('alert');

test.describe('Epic 1, Story 3: Role-based landing routing and route protection', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: Importer lands on the Dashboard after signing in.
  test('an Importer who signs in lands on the Dashboard', async ({ page }) => {
    await mockSignedInAs(page, 'Importer');

    await signIn(page, 'Importer');

    await expect(page).toHaveURL(new RegExp(`${DASHBOARD_ROUTE}$`));
    await expect(page).not.toHaveURL(/\/login$/);
  });

  // AC-1: Approver lands on the Transactions screen after signing in.
  test('an Approver who signs in lands on the Transactions screen', async ({
    page,
  }) => {
    await mockSignedInAs(page, 'Approver');

    await signIn(page, 'Approver');

    await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}$`));
    await expect(page).not.toHaveURL(/\/login$/);
  });

  // AC-2: a signed-out user opening a protected route is redirected to /login.
  test('a signed-out visitor opening a protected route is redirected to the login screen', async ({
    page,
  }) => {
    // No session: the userinfo proxy answers 401 (the Story 1 proxy contract).
    await page.route(USERINFO_PROXY, (route: Route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'SESSION_INVALID',
          message: 'Not authenticated.',
        }),
      }),
    );

    await page.goto(DASHBOARD_ROUTE);

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('button', { name: /sign in|log in|login/i }),
    ).toBeVisible();
  });

  // AC-2 (companion): the application root is itself a protected entry point —
  // an unauthenticated visitor at "/" is redirected to login (§9 step 1).
  test('a signed-out visitor opening the application root is redirected to the login screen', async ({
    page,
  }) => {
    await page.route(USERINFO_PROXY, (route: Route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'SESSION_INVALID',
          message: 'Not authenticated.',
        }),
      }),
    );

    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
  });

  // AC-3: a user opening a route their role lacks sees an in-page
  // permission-denied banner naming the missing permission — not a 403 page.
  test('an Approver opening an Importer-only route sees an in-page permission-denied banner naming the missing permission', async ({
    page,
  }) => {
    // Approver is authenticated but the Dashboard route is not in their Pages,
    // so the layer must render the in-page denial banner, not a 403 page and
    // not a redirect to login (they ARE signed in).
    await mockSignedInAs(page, 'Approver');

    await signIn(page, 'Approver');
    await expect(page).toHaveURL(new RegExp(`${TRANSACTIONS_ROUTE}$`));

    // Navigate to the Importer-only Dashboard route directly.
    await page.goto(DASHBOARD_ROUTE);

    // Still signed in — NOT bounced to login.
    await expect(page).not.toHaveURL(/\/login$/);

    const banner = permissionDeniedBanner(page);
    await expect(banner).toBeVisible();
    // The banner names the missing permission / denied surface (project-brief §2).
    await expect(banner).toContainText(/dashboard|permission/i);

    // It is an IN-PAGE banner, not a generic 403 error page.
    await expect(page.getByText(/^403$/)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /403|forbidden/i }),
    ).toHaveCount(0);
  });
});
