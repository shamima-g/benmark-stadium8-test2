/**
 * Story Metadata:
 * - Route: /login
 * - Target File: web/src/app/login/page.tsx
 * - Page Action: create_new
 *
 * E2E spec for Epic 1, Story 2: Login screen with credential and connectivity
 * error states.
 *
 * Source of truth: generated-docs/specs/project-brief.md (R1, R2, NFR5, §5
 * POPIA privacy-policy link) and documentation/auth-api.yaml.
 *
 * The login form submits to the SAME-ORIGIN BFF proxy POST /api/auth/login
 * (web/src/app/api/auth/[...route]/route.ts, built in Story 1) with a JSON body
 * { email, password }. The proxy maps `email` -> BFF `Username`. Per the proxy
 * contract, the browser observes these proxy responses:
 *   - 200 { Messages: [...] }                                   -> success
 *   - 401 { error: 'INVALID_CREDENTIALS', message: '...' }      -> credential failure
 *   - 500 { error: 'INTERNAL_SERVER_ERROR', message: '...' }    -> connectivity/BFF failure
 *
 * Mocking follows the project default (page-route-with-spec): we intercept the
 * same-origin proxy endpoint with page.route() and return shapes derived from
 * the proxy contract above, so no live BFF is required. The connectivity case
 * uses a true network abort to exercise the distinct connectivity-error path
 * (NFR5), separate from the 401 credential path (R2).
 *
 * These tests WILL FAIL until the /login page is implemented (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';

/**
 * The login form's own error live region. Next.js App Router always renders a
 * hidden, body-level `__next-route-announcer__` element that also carries
 * role="alert", so a bare getByRole('alert') is ambiguous under Playwright
 * strict mode. The form's error alert is rendered inside the <form>, so scoping
 * the lookup there matches only the user-visible login error and excludes the
 * route announcer — without changing what the test asserts.
 */
const loginErrorAlert = (page: Page) => page.locator('form').getByRole('alert');

/** Resolves the proxy request as a credential failure (401), per the proxy contract. */
async function fulfillCredentialFailure(route: Route) {
  await route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    }),
  });
}

/** Resolves the proxy request as a successful login (200), per the proxy contract. */
async function fulfillSuccess(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ Messages: ['Login successful'] }),
  });
}

test.describe('Epic 1, Story 2: Login screen error states', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1
  test('shows email + password fields, a submit control, and a privacy-policy link', async ({
    page,
  }) => {
    await page.goto('/login');

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /sign in|log in|login/i }),
    ).toBeVisible();
    // POPIA: privacy-policy link must be visible on the data-collection form (§5).
    await expect(page.getByRole('link', { name: /privacy/i })).toBeVisible();
  });

  // AC-2
  test('wrong credentials show an inline credential error that does not reveal the wrong field', async ({
    page,
  }) => {
    await page.route(LOGIN_PROXY, fulfillCredentialFailure);

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(importerUser.email);
    await page.getByLabel(/password/i).fill(importerUser.password);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    const errorAlert = loginErrorAlert(page);
    await expect(errorAlert).toBeVisible();
    // Generic message — never names which field was wrong (auth-api.yaml, R2).
    const errorText = (await errorAlert.textContent())?.toLowerCase() ?? '';
    expect(errorText).not.toContain('email is');
    expect(errorText).not.toContain('password is');
    expect(errorText).not.toContain('no account');
    expect(errorText).not.toContain('user not found');
    // No connectivity-style retry control on a pure credential failure.
    await expect(
      page.getByRole('button', { name: /retry|try again/i }),
    ).toHaveCount(0);
  });

  // AC-3
  test('unreachable service shows a distinct connectivity error with a retry control', async ({
    page,
  }) => {
    // Abort the proxy request to simulate the BFF being unreachable (network
    // failure). This is the connectivity path (NFR5), distinct from a 401.
    await page.route(LOGIN_PROXY, (route) => route.abort('failed'));

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(importerUser.email);
    await page.getByLabel(/password/i).fill(importerUser.password);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    const errorAlert = loginErrorAlert(page);
    await expect(errorAlert).toBeVisible();
    // The connectivity error offers a retry affordance...
    await expect(
      page.getByRole('button', { name: /retry|try again/i }),
    ).toBeVisible();
    // ...and must NOT be the credential message (R2: the two are distinguished).
    await expect(errorAlert).not.toContainText(/invalid email or password/i);
  });

  // AC-3 (companion): a 5xx from the proxy is also treated as connectivity, not credential.
  test('a server error from the proxy surfaces the connectivity error, not the credential one', async ({
    page,
  }) => {
    await page.route(LOGIN_PROXY, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'INTERNAL_SERVER_ERROR',
          message: 'Unable to sign in. Please try again.',
        }),
      }),
    );

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(importerUser.email);
    await page.getByLabel(/password/i).fill(importerUser.password);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    await expect(
      page.getByRole('button', { name: /retry|try again/i }),
    ).toBeVisible();
    await expect(loginErrorAlert(page)).not.toContainText(
      /invalid email or password/i,
    );
  });

  // AC-2 (companion): a successful login clears any prior error and does not surface one.
  test('a successful submission does not surface a credential or connectivity error', async ({
    page,
  }) => {
    await page.route(LOGIN_PROXY, fulfillSuccess);

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(importerUser.email);
    await page.getByLabel(/password/i).fill(importerUser.password);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    // The login screen itself does not leave a credential/connectivity error
    // standing on success. (Role-based landing routing is Story 3's concern.)
    await expect(page).not.toHaveURL(/\/login$/);
  });
});
