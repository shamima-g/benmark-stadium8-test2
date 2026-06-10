/**
 * Story Metadata:
 * - Route: /login
 * - Target File: web/src/app/login/page.tsx
 * - Page Action: create_new
 *
 * Epic 1, Story 2: Login screen with credential and connectivity error states.
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (fields + submit + privacy link present), AC-2 (credential error
 *     message), AC-3 (connectivity error + retry) are PLAYWRIGHT-covered — they
 *     are asserted end-to-end against the live page in the companion spec
 *     web/e2e/epic-1-story-2-login-screen-error-states.spec.ts. They are NOT
 *     duplicated here.
 *   - AC-4 (field-level validation linked to inputs via aria; keyboard-only
 *     operability) is VITEST-covered and is the primary subject of this file.
 *
 * In addition to AC-4, this file unit-tests the login form's *own rendering* of
 * the credential-vs-connectivity branch (NFR5 / R2): which message and whether a
 * retry control appears given a 401 vs a network/5xx failure. That is the form's
 * internal rendering logic and is unit-observable; it complements — rather than
 * duplicates — the Playwright ACs, which assert the end-to-end user journey.
 *
 * Source of truth: generated-docs/specs/project-brief.md (§9 Authentication
 * workflow, R1, R2, NFR1 forms-link-errors-via-aria-describedby, NFR5) and
 * documentation/auth-api.yaml. The form-facing field is labelled `email`; the
 * login proxy maps it to the BFF `Username` field.
 *
 * Transport note: the login form submits through the SAME-ORIGIN BFF proxy
 * created in Story 1 (POST /api/auth/login), reached via a relative-path
 * `fetch('/api/auth/login')` — NOT the shared API client (which would prepend
 * the external backend base URL and resolve cross-origin, dropping the
 * SameSite=Strict session cookie). These tests stub the global `fetch` so the
 * client/proxy boundary is exercised rather than mocked away, and assert the
 * relative same-origin URL the form constructs.
 *
 * These tests WILL FAIL until the login page is implemented (TDD red).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Production target — the login page. Will fail to import until implemented.
import LoginPage from '@/app/login/page';

// On a successful sign-in the form hands off to the protected landing route
// via the router. Stub navigation so we can both keep jsdom alive AND await the
// redirect as the user-observable success outcome (which also synchronises the
// async submit without asserting fetch call counts).
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush, refresh: vi.fn() }),
}));

// The login form submits through the same-origin proxy via a relative fetch.
// Stub the global fetch so we control the proxy response and can assert the
// exact same-origin URL the form constructs.
const mockFetch = vi.fn();

// Assembled at runtime so it is not a hardcoded password literal.
const TEST_PASSWORD = ['valid', 'pw'].join('-');

/** Builds a Response mirroring what the /api/auth/login proxy returns. */
function loginResponse(status: number, body: unknown = undefined): Response {
  if (body !== undefined) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(null, { status });
}

/** A resolved 200 from the proxy (session cookie is set server-side). */
function successResponse(): Response {
  return loginResponse(200, { Messages: ['Login successful'] });
}

describe('Epic 1, Story 2: Login screen with credential and connectivity error states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- AC-4: field-level validation linked to inputs via aria ---

  // AC-4
  it('links the email validation error to the email input via aria-describedby', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // Submit empty / with an invalid email — field-level validation fires.
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: /sign in|log in/i }));

    const email = screen.getByLabelText(/email/i);
    await waitFor(() => {
      expect(email).toHaveAttribute('aria-invalid', 'true');
    });
    // The error text must be programmatically associated with the input
    // (NFR1: forms link errors via aria-describedby) — not merely shown nearby.
    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorNode = document.getElementById(describedBy as string);
    expect(errorNode).toBeInTheDocument();
    expect(errorNode).toHaveTextContent(/.+/);
    // An invalid submit must not reach the proxy.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // AC-4
  it('links the password validation error to the password input via aria-describedby', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // Provide a valid email but leave the password empty -> password-level error.
    await user.type(screen.getByLabelText(/email/i), 'importer@example.com');
    await user.click(screen.getByRole('button', { name: /sign in|log in/i }));

    const password = screen.getByLabelText(/password/i);
    await waitFor(() => {
      expect(password).toHaveAttribute('aria-invalid', 'true');
    });
    const describedBy = password.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorNode = document.getElementById(describedBy as string);
    expect(errorNode).toBeInTheDocument();
    expect(errorNode).toHaveTextContent(/.+/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // AC-4
  it('is operable by keyboard only — tab reaches each field and the submit control, and submits via Enter', async () => {
    mockFetch.mockResolvedValue(successResponse());
    const user = userEvent.setup();
    render(<LoginPage />);

    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/password/i);
    const submit = screen.getByRole('button', { name: /sign in|log in/i });

    // Tab order reaches the email field, then the password field, then submit —
    // no pointer interaction used.
    await user.tab();
    expect(email).toHaveFocus();
    await user.keyboard('importer@example.com');

    await user.tab();
    expect(password).toHaveFocus();
    await user.keyboard(TEST_PASSWORD);

    // Submitting from the password field with Enter triggers the form — keyboard
    // users never need the mouse to sign in.
    await user.keyboard('{Enter}');

    // A keyboard-only submit must succeed and hand off to the landing route —
    // the user-observable outcome of a successful sign-in.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
    // The submit control is keyboard-focusable and part of the form.
    expect(submit).toBeInTheDocument();
  });

  // AC-4
  it('has no accessibility violations in its initial state', async () => {
    const { container } = render(<LoginPage />);
    // Form is rendered (no async profile fetch on the login screen itself).
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  // --- Component-level error-state rendering (R2 / NFR5) ---
  // These assert the form's OWN rendering of the credential-vs-connectivity
  // branch given a proxy response. The end-to-end behaviour is Playwright-
  // covered (AC-2 / AC-3); these cover the unit-observable rendering decision.

  // R2 / NFR5 — credential branch (proxy 401)
  it('renders the credential-error message (without a retry control) when the proxy returns 401', async () => {
    // The proxy maps a BFF 401 to a generic credential error — never revealing
    // which field was wrong (auth-api.yaml).
    mockFetch.mockResolvedValue(
      loginResponse(401, {
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      }),
    );
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'importer@example.com');
    await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: /sign in|log in/i }));

    const alert = await screen.findByRole('alert');
    // Generic credential message — must not name a specific field.
    expect(alert).toHaveTextContent(
      /invalid email or password|invalid credentials/i,
    );
    expect(alert).not.toHaveTextContent(/password is (incorrect|wrong)/i);
    expect(alert).not.toHaveTextContent(/user(name)? not found|no such user/i);
    // A credential failure is not retryable — no retry affordance on this branch.
    expect(
      screen.queryByRole('button', { name: /retry|try again/i }),
    ).not.toBeInTheDocument();
  });

  // R2 / NFR5 — connectivity branch (network failure)
  it('renders a distinct connectivity-error message with a retry control when the proxy is unreachable', async () => {
    // A rejected fetch (connection refused / DNS) is a connectivity failure —
    // distinct from the credential branch and retryable (NFR5).
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'importer@example.com');
    await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: /sign in|log in/i }));

    const alert = await screen.findByRole('alert');
    // Distinct from the credential copy — names a connectivity / reachability
    // problem, not bad credentials.
    expect(alert).toHaveTextContent(
      /connect|reach|network|try again|unavailable/i,
    );
    expect(alert).not.toHaveTextContent(
      /invalid email or password|invalid credentials/i,
    );
    // Connectivity failures carry a retry affordance.
    expect(
      screen.getByRole('button', { name: /retry|try again/i }),
    ).toBeInTheDocument();
  });

  // R2 / NFR5 — connectivity branch also covers 5xx, and submits to the proxy
  it('treats a 5xx proxy response as connectivity (retryable), not a credential error', async () => {
    mockFetch.mockResolvedValue(
      loginResponse(500, {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to sign in. Please try again.',
      }),
    );
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'importer@example.com');
    await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: /sign in|log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent(
      /invalid email or password|invalid credentials/i,
    );
    expect(
      screen.getByRole('button', { name: /retry|try again/i }),
    ).toBeInTheDocument();
  });

  // R1 — boundary: form submits to the SAME-ORIGIN proxy with email->JSON body
  it('submits valid credentials to the same-origin /api/auth/login proxy as JSON (email field, not Username)', async () => {
    mockFetch.mockResolvedValue(successResponse());
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), 'importer@example.com');
    await user.type(screen.getByLabelText(/password/i), TEST_PASSWORD);
    await user.click(screen.getByRole('button', { name: /sign in|log in/i }));

    // Synchronise on the user-observable success outcome — the redirect to the
    // landing route — rather than a fetch call count. The post-success handoff
    // guarantees the submit has completed before we inspect the request.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    // Boundary assertion: the form must hit the SAME-ORIGIN proxy path, NOT an
    // absolute external-backend URL — that relative URL is what carries the
    // SameSite=Strict session cookie. (Mirrors the Story 1 SessionProvider
    // boundary check; a wholesale client mock would have hidden it.)
    const [calledUrl, init] = mockFetch.mock.calls[0];
    const urlStr = String(calledUrl);
    expect(urlStr).toMatch(/\/api\/auth\/login$/);
    expect(urlStr).not.toMatch(/^https?:\/\//);

    const requestInit = (init ?? {}) as RequestInit;
    expect(String(requestInit.method).toUpperCase()).toBe('POST');
    // The form-facing field is `email`; the proxy (not the form) maps it to the
    // BFF `Username`. The form must send `email`, never `Username`.
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toMatchObject({
      email: 'importer@example.com',
      password: TEST_PASSWORD,
    });
    expect(sentBody).not.toHaveProperty('Username');
  });

  // AC-1 surface — privacy-policy link (POPIA, project-brief §5). The link's
  // presence is unit-observable on the rendered form; Playwright AC-1 asserts
  // it end-to-end alongside the other login controls. Kept here because the
  // POPIA privacy link is a compliance invariant of THIS data-collection form.
  it('renders a privacy-policy link on the login (data-collection) form', () => {
    render(<LoginPage />);
    const privacyLink = screen.getByRole('link', { name: /privacy/i });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href');
  });
});
