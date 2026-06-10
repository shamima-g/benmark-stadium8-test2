/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/shell/AppShell.tsx
 * - Page Action: create_new
 *
 * E2E spec for Epic 1, Story 4: Application shell with role-gated navigation and
 * sign-out.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R1 §7, §2 role/
 * permission matrix — Upload is Importer-only per BR10; NFR1 accessibility,
 * NFR3 responsive, NFR4 browser support §10, §5 POPIA privacy-policy link) and
 * documentation/auth-api.yaml (UserInfoRead / RoleRead / PageRead shapes).
 *
 * Behaviour under test (the persistent shell rendered in the protected layout):
 *   - AC-1: the nav lists only the destinations the signed-in user's role
 *           permits (Importer sees Upload; Approver does not), and the current
 *           user's name/email is displayed.
 *   - AC-2: signing out calls the logout proxy, returns to /login, and a
 *           protected route is no longer reachable via Back (it bounces to
 *           /login because the session is gone).
 *   - AC-3: below the tablet breakpoint (NFR3, <768px) the nav collapses to a
 *           mobile layout with no horizontal overflow.
 *   (AC-4 — keyboard operability of the nav — is covered by Vitest, not here.)
 *
 * Mocking follows the project default (page-route-with-spec): we intercept the
 * SAME-ORIGIN BFF proxy routes built in Story 1
 * (web/src/app/api/auth/[...route]/route.ts):
 *   - POST /api/auth/login    -> 200 { Messages: ['Login successful'] }
 *   - GET  /api/auth/userinfo -> 200 UserInfoRead (role-specific Roles + Pages,
 *                                where Pages[].Route enumerates permitted routes)
 *   - POST /api/auth/logout   -> 200 { Messages: ['Logout successful'] }
 * The userinfo body shape is derived from auth-api.yaml (UserInfoRead/RoleRead/
 * PageRead); the proxy passes the BFF profile through unchanged. The shell reads
 * Roles/Pages to decide which nav destinations to render and renders the user's
 * identity from Email/FirstName/LastName. No live BFF is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert"/banner-like
 * roles. Navigation/banner locators are therefore scoped to page content
 * (getByRole('navigation') / getByRole('main')) to avoid Playwright strict-mode
 * collisions with that body-level element.
 *
 * These tests WILL FAIL until the AppShell + protected layout are implemented
 * (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
const LOGOUT_PROXY = '**/api/auth/logout';

/** Role-permitted routes (project-brief §2 matrix). */
const DASHBOARD_ROUTE = '/dashboard'; // both roles
const TRANSACTIONS_ROUTE = '/transactions'; // both roles (Approver landing)
const UPLOAD_ROUTE = '/upload'; // Importer-only (BR10)

type Persona = 'Importer' | 'Approver';

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. Pages[].Route
 * enumerates the routes the user's role may reach, and therefore which nav
 * destinations the shell renders. Importer gets Upload (Importer-only per §2 /
 * BR10) plus the shared Dashboard + Transactions; Approver gets the shared pair
 * only (no Upload).
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

/** Fulfils the userinfo proxy as an authenticated session for the persona. */
function fulfillUserInfo(persona: Persona) {
  return (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(persona)),
    });
}

/** Fulfils the userinfo proxy as a signed-out (no/expired session) state. */
const fulfillNoSession = (route: Route) =>
  route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({
      error: 'SESSION_INVALID',
      message: 'Not authenticated.',
    }),
  });

/** Stubs login + userinfo (+ logout) so the persona presents as signed in. */
async function mockSignedInAs(page: Page, persona: Persona) {
  await page.route(LOGIN_PROXY, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Messages: ['Login successful'] }),
    }),
  );
  await page.route(USERINFO_PROXY, fulfillUserInfo(persona));
  await page.route(LOGOUT_PROXY, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Messages: ['Logout successful'] }),
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
  // Land inside the protected shell before asserting against it.
  await expect(page).not.toHaveURL(/\/login$/);
}

/** The shell's primary navigation region (scoped — excludes body-level announcer). */
const shellNav = (page: Page) => page.getByRole('navigation');

test.describe('Epic 1, Story 4: Application shell with role-gated navigation and sign-out', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: Importer sees Importer-permitted destinations (incl. Upload) and identity.
  test('an Importer sees the Upload destination and their own identity in the shell nav', async ({
    page,
  }) => {
    await mockSignedInAs(page, 'Importer');
    await signIn(page, 'Importer');

    const nav = shellNav(page);
    await expect(nav.getByRole('link', { name: /upload/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(
      nav.getByRole('link', { name: /transactions/i }),
    ).toBeVisible();

    // The current user's identity (name or email) is shown in the shell.
    await expect(
      page.getByText(new RegExp(importerUser.email, 'i')),
    ).toBeVisible();
  });

  // AC-1: Approver does NOT see the Importer-only Upload destination.
  test('an Approver does not see the Importer-only Upload destination in the shell nav', async ({
    page,
  }) => {
    await mockSignedInAs(page, 'Approver');
    await signIn(page, 'Approver');

    const nav = shellNav(page);
    // Shared destinations are present...
    await expect(
      nav.getByRole('link', { name: /transactions/i }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: /dashboard/i })).toBeVisible();
    // ...but Upload (Importer-only, BR10) is absent for the Approver.
    await expect(nav.getByRole('link', { name: /upload/i })).toHaveCount(0);

    // Identity is still surfaced for the Approver.
    await expect(
      page.getByText(new RegExp(approverUser.email, 'i')),
    ).toBeVisible();
  });

  // AC-2: signing out returns to /login and protected routes are not reachable via Back.
  test('signing out returns to the login screen and a protected route is not reachable via Back', async ({
    page,
  }) => {
    await mockSignedInAs(page, 'Importer');
    await signIn(page, 'Importer');

    // Sign out — the shell calls the logout proxy (mocked 200) then returns to /login.
    await page
      .getByRole('button', { name: /sign out|log out|logout/i })
      .click();
    await expect(page).toHaveURL(/\/login$/);

    // The session is now gone: from here on the userinfo proxy answers 401.
    await page.unroute(USERINFO_PROXY);
    await page.route(USERINFO_PROXY, fulfillNoSession);

    // Pressing Back must NOT re-enter the protected surface — it bounces to /login.
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('button', { name: /sign in|log in|login/i }),
    ).toBeVisible();
  });

  // AC-3: below the tablet breakpoint the shell collapses with no horizontal overflow.
  test('the shell collapses to a mobile layout below the tablet breakpoint with no horizontal scroll', async ({
    page,
  }) => {
    // Mobile viewport, below the 768px tablet breakpoint (NFR3).
    await page.setViewportSize({ width: 375, height: 812 });

    await mockSignedInAs(page, 'Importer');
    await signIn(page, 'Importer');

    // The mobile layout hides the inline nav behind a menu trigger (e.g. a
    // hamburger / "open menu" control) rather than showing all links inline.
    const menuTrigger = page.getByRole('button', {
      name: /menu|navigation|open menu/i,
    });
    await expect(menuTrigger).toBeVisible();

    // No horizontal overflow at the mobile width (NFR3: "no horizontal scroll").
    const hasNoHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(hasNoHorizontalOverflow).toBe(true);
  });
});
