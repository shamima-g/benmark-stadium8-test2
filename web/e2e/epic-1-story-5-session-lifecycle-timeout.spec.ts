/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/shell/SessionTimeout.tsx
 * - Page Action: create_new
 *
 * E2E spec for Epic 1, Story 5: Session lifecycle — idle warning and timeout
 * handling. Covers the two Playwright-tagged acceptance criteria:
 *   - AC-1: after the idle threshold, a 60-second warning appears and the user
 *           can choose to stay signed in, which dismisses the warning and keeps
 *           them in the app.
 *   - AC-2: ignoring the warning counts down, signs the user out, returns them
 *           to /login, and shows a "your session ended" explanation.
 * (AC-3 401 handling and AC-4 timing constants are vitest-covered, not here.)
 *
 * Source of truth: generated-docs/specs/project-brief.md (NFR5, NFR6 — idle
 * session timeout 15 min with a 60-second warning, absolute 8-hour cap) and
 * documentation/auth-api.yaml (UserInfoRead shape, session cookie contract).
 *
 * ---------------------------------------------------------------------------
 * DETERMINISTIC TIMING CONTRACT (developer must honour this) — clock mocking
 * ---------------------------------------------------------------------------
 * The real idle threshold is 15 minutes; we cannot wait that long in an E2E.
 * This spec drives the timing deterministically with Playwright's CLOCK MOCK
 * (`page.clock.install` + `page.clock.fastForward`) rather than env overrides,
 * so it works against the dev server that playwright.config.ts boots without
 * any build-time NEXT_PUBLIC_* plumbing.
 *
 * For `page.clock.fastForward` to advance the SessionTimeout component, the
 * implementation MUST measure idle/warning/absolute timing using the BROWSER
 * clock that Playwright can control:
 *   - schedule the idle deadline and the warning countdown with the global
 *     `setTimeout` / `setInterval` (and/or read `Date.now()`), NOT a high-res
 *     `performance.now()` source and NOT a server-side timer.
 *   - reset the idle timer on real user-activity events (pointer/keyboard).
 * `page.clock.install()` is called BEFORE the app loads so every timer the
 * component arms is the mocked one. We fast-forward past the idle threshold to
 * surface the warning, then past the 60-second countdown to trigger sign-out.
 * The exact threshold values stay an implementation detail (the vitest suite
 * pins them); this spec only fast-forwards a generous amount (16 min idle, then
 * 61 s) so it stays correct regardless of the precise constants.
 *
 * ---------------------------------------------------------------------------
 * MOCKING — project default (page-route-with-spec)
 * ---------------------------------------------------------------------------
 * Same-origin BFF proxy routes (web/src/app/api/auth/[...route]/route.ts) are
 * intercepted with page.route(); shapes follow the proxy contract + auth-api
 * UserInfoRead schema. No live BFF is required:
 *   - POST /api/auth/login    -> 200 { Messages: [...] }   (sets session)
 *   - GET  /api/auth/userinfo -> 200 UserInfoRead          (drives authed state)
 *   - POST /api/auth/logout   -> 200 { Messages: [...] }   (sign-out)
 *
 * These tests WILL FAIL until SessionTimeout is implemented and mounted in the
 * shell at `/` (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
const LOGOUT_PROXY = '**/api/auth/logout';

/** Comfortably past a 15-minute idle threshold, in milliseconds. */
const PAST_IDLE_MS = 16 * 60 * 1000;
/** Comfortably past the 60-second warning countdown, in milliseconds. */
const PAST_WARNING_MS = 61 * 1000;

/**
 * UserInfoRead body (auth-api.yaml schema; RolesString example is a spec
 * placeholder so we use the Importer role name the brief settled on). Keeps the
 * authenticated shell rendered while we exercise the idle lifecycle.
 */
const importerUserInfo = {
  Id: 1,
  Email: importerUser.email,
  FirstName: 'Imogen',
  LastName: 'Porter',
  RolesString: 'Importer',
  Roles: [{ Id: 1, Name: 'Importer' }],
  Pages: [],
};

/** Wires the three same-origin auth proxy routes to their happy-path shapes. */
async function mockAuthProxy(page: Page): Promise<void> {
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
      body: JSON.stringify(importerUserInfo),
    }),
  );
  await page.route(LOGOUT_PROXY, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Messages: ['Logout successful'] }),
    }),
  );
}

/**
 * Signs in as the Importer and lands on the authenticated shell at `/`.
 * The clock is installed beforehand by the test so every timer the shell arms
 * is the mocked one.
 */
async function signInToShell(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(importerUser.email);
  await page.getByLabel(/password/i).fill(importerUser.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  // Post-login routing lands on the role-specific surface under the shell, not
  // back on /login. (Exact landing route is Story 3's concern.)
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
}

/**
 * The idle-warning surface. Scope to a dialog role so we never match Next.js's
 * body-level `__next-route-announcer__` (which also carries role="alert").
 * Prefer alertdialog (a warning that demands a response); fall back to dialog.
 */
const warningDialog = (page: Page) =>
  page.getByRole('alertdialog').or(page.getByRole('dialog'));

test.describe('Epic 1, Story 5: Session lifecycle — idle warning and timeout', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // Install the clock BEFORE any app code runs so the SessionTimeout timers
    // are the mocked ones we can fast-forward.
    await page.clock.install();
    await mockAuthProxy(page);
  });

  // AC-1
  test('idle threshold surfaces a warning that "stay signed in" dismisses, keeping the user in the app', async ({
    page,
  }) => {
    await signInToShell(page);
    const urlBeforeIdle = page.url();

    // No warning while the user is active.
    await expect(warningDialog(page)).toBeHidden();

    // Fast-forward past the 15-minute idle threshold — the warning appears.
    await page.clock.fastForward(PAST_IDLE_MS);

    const dialog = warningDialog(page);
    await expect(dialog).toBeVisible();
    // The warning explains the impending sign-out (NFR6: 60-second warning).
    await expect(dialog).toContainText(
      /sign(ing)? out|session|expir|idle|inactiv/i,
    );

    // Choosing to stay signed in dismisses the warning...
    await dialog
      .getByRole('button', { name: /stay signed in|stay|keep|continue/i })
      .click();
    await expect(warningDialog(page)).toBeHidden();

    // ...and the user remains on the same authenticated surface (not /login).
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    await expect(page).toHaveURL(urlBeforeIdle);
  });

  // AC-1 (companion): after staying signed in, the idle timer is reset, so a
  // subsequent idle period must surface the warning again rather than expiring
  // silently. Guards against a one-shot timer that never re-arms.
  test('staying signed in re-arms the idle timer so the warning can reappear', async ({
    page,
  }) => {
    await signInToShell(page);

    await page.clock.fastForward(PAST_IDLE_MS);
    const dialog = warningDialog(page);
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('button', { name: /stay signed in|stay|keep|continue/i })
      .click();
    await expect(warningDialog(page)).toBeHidden();

    // A fresh idle period must raise the warning again, and the user is still
    // signed in (the "stay" choice extended, it did not end, the session).
    await page.clock.fastForward(PAST_IDLE_MS);
    await expect(warningDialog(page)).toBeVisible();
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
  });

  // AC-2
  test('ignoring the warning counts down, signs the user out, and returns to /login with an explanation', async ({
    page,
  }) => {
    await signInToShell(page);

    // Reach the warning, then ignore it.
    await page.clock.fastForward(PAST_IDLE_MS);
    await expect(warningDialog(page)).toBeVisible();

    // Let the 60-second countdown elapse without interacting.
    await page.clock.fastForward(PAST_WARNING_MS);

    // The user is signed out and returned to the login screen...
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(
      page.getByRole('button', { name: /sign in|log in|login/i }),
    ).toBeVisible();

    // ...with a clear "your session ended" explanation on the login screen.
    // Scope to the login page <form>/main content; never the route announcer.
    await expect(
      page.getByText(
        /your session (ended|has ended|expired|timed out)|session ended|signed out due to inactivity/i,
      ),
    ).toBeVisible();
  });

  // AC-2 (companion): sign-out on expiry actually calls the BFF logout proxy so
  // the server-side session is cleared, not just the client UI swapped out.
  test('expiry sign-out invokes the BFF logout proxy', async ({ page }) => {
    await signInToShell(page);

    const logoutCalled = page.waitForRequest(
      (req) =>
        /\/api\/auth\/logout$/.test(req.url()) && req.method() === 'POST',
    );

    await page.clock.fastForward(PAST_IDLE_MS);
    await expect(warningDialog(page)).toBeVisible();
    await page.clock.fastForward(PAST_WARNING_MS);

    await logoutCalled;
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
