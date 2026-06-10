/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/shell/AppShell.tsx
 * - Page Action: create_new
 *
 * Epic 1, Story 4: Application shell with role-gated navigation and sign-out.
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (nav shows only the role-permitted destinations + identity displayed),
 *     AC-2 (sign-out returns to /login AND a protected route is no longer
 *     reachable via Back), and AC-3 (shell collapses to a mobile layout with no
 *     horizontal scroll below the tablet breakpoint) are PLAYWRIGHT-covered. They
 *     depend on real cookie/redirect chains, browser Back-button history, and a
 *     real viewport/layout reflow — none of which jsdom can exercise — so they are
 *     asserted end-to-end in the companion spec
 *     web/e2e/epic-1-story-4-app-shell-nav-signout.spec.ts and are NOT duplicated
 *     here.
 *   - AC-4 (navigation is keyboard-operable and exposes accessible names for all
 *     controls) is VITEST-covered and is the primary subject of this file.
 *
 * In addition to AC-4, this file unit-tests the shell's OWN rendering decisions
 * that are observable in jsdom and are this story's delta (not redone from the
 * Epic 1 baseline):
 *   - role-gated nav-item rendering keyed off the user's GRANTED ROUTE SET
 *     (AuthUser.routes — PageRead.Route), the same signal Story 3's gate/resolver
 *     consume (project-brief §2 permission matrix; R1 §7);
 *   - the signed-in user's identity (name / email) is displayed;
 *   - the client-side half of sign-out: clicking the control POSTs to the
 *     SAME-ORIGIN logout proxy (POST /api/auth/logout, created in Story 1) and
 *     then hands off to /login via the router. The end-to-end redirect chain +
 *     Back-button invalidation is the Playwright AC-2 concern; the request
 *     boundary and the router hand-off are the unit-observable half asserted here.
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - §2 permission matrix + "Denied actions are HIDDEN in the UI, not rendered as
 *     disabled controls": role-gated nav items are absent, not disabled.
 *   - R1 (§7): role-specific landing surfaces (Importer -> Dashboard; Approver ->
 *     Transactions) — the nav exposes exactly the granted routes.
 *   - §3 Authentication: sign-out goes through POST /v1/auth/logout via the BFF
 *     proxy; on success the user returns to the login screen.
 *   - §5 Compliance (POPIA): a privacy-policy link is visible in the shell.
 *   - NFR1 (§10): keyboard-first operation; controls carry accessible names.
 *
 * Transport note: sign-out submits through the SAME-ORIGIN BFF proxy
 * (POST /api/auth/logout) via a relative-path `fetch('/api/auth/logout')` — NOT
 * the shared API client (which would prepend the external backend base URL and
 * resolve cross-origin, dropping the SameSite=Strict session cookie). These tests
 * stub the global `fetch` so the client/proxy boundary is exercised rather than
 * mocked away, and assert the relative same-origin URL the shell constructs —
 * mirroring the Story 1 SessionProvider and Story 2 login-form boundary checks.
 *
 * These tests WILL FAIL until the AppShell is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Production target — the application shell. Will fail to import until implemented.
import { AppShell } from '@/components/shell/AppShell';
import { SessionProvider } from '@/components/auth/SessionProvider';
import {
  createMockImporterUserInfo,
  createMockApproverUserInfo,
  type UserInfoResponse,
} from '../helpers/epic-1-mock-data';

// Sign-out hands off to the login screen via the router. Stub navigation so we
// can both keep jsdom alive AND await the hand-off as the user-observable
// outcome of a successful sign-out.
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush, refresh: vi.fn() }),
  usePathname: () => '/dashboard',
}));

// The shell loads identity through the SessionProvider (same-origin userinfo
// fetch) and signs out through the same-origin logout proxy. A single global
// fetch stub serves both: userinfo on mount, logout on the sign-out click.
const mockFetch = vi.fn();

/** A 200 userinfo Response for the given persona's BFF payload. */
function userinfoResponse(payload: UserInfoResponse): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** A 200 logout Response mirroring what the /api/auth/logout proxy returns. */
function logoutResponse(): Response {
  return new Response(JSON.stringify({ Messages: ['Logout successful'] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Importer userinfo Response (grants Dashboard + Transactions). */
const importerUserinfo = () => userinfoResponse(createMockImporterUserInfo());

/** Approver userinfo Response (grants Transactions only — no Dashboard). */
const approverUserinfo = () => userinfoResponse(createMockApproverUserInfo());

/** Renders the shell under the session surface (the production composition). */
function renderShell() {
  return render(
    <SessionProvider>
      <AppShell>
        <main>page content</main>
      </AppShell>
    </SessionProvider>,
  );
}

/** Resolves once the shell's navigation landmark has rendered. */
async function findNav(): Promise<HTMLElement> {
  return screen.findByRole('navigation');
}

describe('Epic 1, Story 4: Application shell with role-gated navigation and sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- Role-gated nav rendering (this story's delta; §2 / R1) ---

  // §2 / R1 — Importer's granted routes are exposed in the nav.
  it("shows the Importer's permitted destinations (Dashboard and Transactions) in the nav", async () => {
    mockFetch.mockResolvedValue(importerUserinfo());
    renderShell();

    const nav = await findNav();
    await waitFor(() => {
      expect(
        within(nav).getByRole('link', { name: /dashboard/i }),
      ).toBeInTheDocument();
    });
    expect(
      within(nav).getByRole('link', { name: /transactions/i }),
    ).toBeInTheDocument();
  });

  // §2 / R1 — Approver's granted set excludes the Dashboard. Denied destinations
  // are HIDDEN (absent), not rendered as disabled controls (§2).
  it('hides the Dashboard nav item for an Approver (granted Transactions only)', async () => {
    mockFetch.mockResolvedValue(approverUserinfo());
    renderShell();

    const nav = await findNav();
    await waitFor(() => {
      expect(
        within(nav).getByRole('link', { name: /transactions/i }),
      ).toBeInTheDocument();
    });
    // Hidden, not disabled — the link must be entirely absent from the nav.
    expect(
      within(nav).queryByRole('link', { name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });

  // --- Identity display (this story's delta) ---

  // §2 / NFR1 — the signed-in user's identity is surfaced in the shell.
  it("displays the signed-in user's name or email", async () => {
    mockFetch.mockResolvedValue(importerUserinfo());
    renderShell();

    // The joined first/last name is the primary identity signal; the email is an
    // acceptable fallback. Either satisfies "the user's name or email is displayed".
    await waitFor(() => {
      expect(
        screen.getByText((content) =>
          /ingrid mporter|importer@example\.com/i.test(content),
        ),
      ).toBeInTheDocument();
    });
  });

  // --- AC-4: keyboard operability + accessible names for all controls ---

  // AC-4 — every nav destination is a control with an accessible name (no
  // ambiguous icon-only links). NFR1: icon-only controls carry an accessible name.
  it('exposes an accessible name on every navigation control', async () => {
    mockFetch.mockResolvedValue(importerUserinfo());
    renderShell();

    const nav = await findNav();
    await waitFor(() => {
      expect(within(nav).getAllByRole('link').length).toBeGreaterThan(0);
    });
    // Every link inside the nav must have a non-empty accessible name.
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).toHaveAccessibleName(/\S/);
    }
  });

  // AC-4 — the nav is operable by keyboard alone: a nav destination is focusable
  // and the nav does not trap focus (Tab advances away from it).
  it('lets a keyboard user Tab through the navigation destinations', async () => {
    mockFetch.mockResolvedValue(importerUserinfo());
    const user = userEvent.setup();
    renderShell();

    const nav = await findNav();
    const dashboard = await within(nav).findByRole('link', {
      name: /dashboard/i,
    });

    // The link is keyboard-reachable / focusable (no pointer interaction used).
    dashboard.focus();
    expect(dashboard).toHaveFocus();

    // Tab advances to the next focusable control — the nav does not trap focus.
    await user.tab();
    expect(dashboard).not.toHaveFocus();
  });

  // AC-4 — the sign-out control is reachable and activatable by keyboard alone,
  // and carries an accessible name. Activating it via Enter triggers sign-out
  // (the user-observable hand-off to /login).
  it('lets a keyboard user activate sign-out and hands off to the login screen', async () => {
    mockFetch.mockResolvedValueOnce(importerUserinfo());
    mockFetch.mockResolvedValueOnce(logoutResponse());
    const user = userEvent.setup();
    renderShell();

    const signOut = await screen.findByRole('button', {
      name: /sign out|log out|logout/i,
    });
    // Accessible name present (NFR1) and keyboard-focusable.
    expect(signOut).toHaveAccessibleName(/sign out|log out|logout/i);

    signOut.focus();
    expect(signOut).toHaveFocus();
    await user.keyboard('{Enter}');

    // The user-observable outcome of a successful sign-out is the hand-off to the
    // login screen. (The end-to-end redirect + Back-button invalidation is the
    // Playwright AC-2 concern.)
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  // AC-4 — the shell has no accessibility violations once identity has loaded.
  it('has no accessibility violations once the session has loaded', async () => {
    mockFetch.mockResolvedValue(importerUserinfo());
    const { container } = renderShell();

    // Wait for the async identity load to settle so axe sees the populated shell.
    await screen.findByRole('navigation');
    await waitFor(() => {
      expect(
        screen.getByText((content) =>
          /ingrid mporter|importer@example\.com/i.test(content),
        ),
      ).toBeInTheDocument();
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  // --- Sign-out request boundary (client half of AC-2; §3) ---

  // §3 — the client half of sign-out: the control POSTs to the SAME-ORIGIN
  // logout proxy, NOT an absolute external-backend URL (that relative URL is what
  // carries the SameSite=Strict session cookie). Mirrors the Story 1/2 boundary
  // checks; a wholesale client mock would have hidden it.
  it('signs out via the same-origin /api/auth/logout proxy (POST), not an external URL', async () => {
    mockFetch.mockResolvedValueOnce(importerUserinfo());
    mockFetch.mockResolvedValueOnce(logoutResponse());
    const user = userEvent.setup();
    renderShell();

    const signOut = await screen.findByRole('button', {
      name: /sign out|log out|logout/i,
    });
    await user.click(signOut);

    // Synchronise on the user-observable success outcome — the hand-off to /login.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    // The logout request must hit the SAME-ORIGIN proxy path via POST. (userinfo
    // was the first fetch, on mount; logout is the one matching the proxy path.)
    const logoutCall = mockFetch.mock.calls.find((call) =>
      /\/api\/auth\/logout$/.test(String(call[0])),
    );
    expect(logoutCall).toBeDefined();
    const [calledUrl, init] = logoutCall as [string, RequestInit | undefined];
    expect(String(calledUrl)).not.toMatch(/^https?:\/\//);
    expect(String((init ?? {}).method).toUpperCase()).toBe('POST');
  });

  // --- Privacy-policy link (POPIA, §5) ---

  // §5 — POPIA: a privacy-policy link is visible in the shell (footer/shell).
  it('renders a privacy-policy link in the shell', async () => {
    mockFetch.mockResolvedValue(importerUserinfo());
    renderShell();

    await findNav();
    const privacyLink = await screen.findByRole('link', { name: /privacy/i });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href');
  });
});
