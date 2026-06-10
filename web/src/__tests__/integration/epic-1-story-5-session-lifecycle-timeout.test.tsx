/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/shell/SessionTimeout.tsx
 * - Page Action: create_new
 *
 * Epic 1, Story 5: Session lifecycle — idle warning and timeout handling.
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (after the idle threshold the user sees a 60-second warning and can
 *     choose to stay signed in, dismissing it) and AC-2 (ignoring the warning
 *     signs the user out and returns them to the login screen with an
 *     explanation) are PLAYWRIGHT-covered. They depend on a real cookie/redirect
 *     chain landing on the login screen and on the "session ended" explanation
 *     surfacing on the real login route — exercised end-to-end in the companion
 *     spec web/e2e/epic-1-story-5-session-lifecycle-timeout.spec.ts and NOT
 *     duplicated here.
 *   - AC-3 (a 401 from any protected request signs the user out and routes to
 *     /login rather than failing silently) is VITEST-covered here.
 *   - AC-4 (the absolute session cap and idle thresholds are enforced from the
 *     documented timing values) is VITEST-covered here, with fake timers
 *     asserting the thresholds rather than real waits.
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - NFR6 (§10): idle session timeout 15 minutes with a 60-second warning;
 *     absolute session timeout 8 hours. These are the documented timing values
 *     AC-4 enforces. They MUST be defined as named constants (not magic numbers)
 *     so they are testable — this file imports them from the production module
 *     @/lib/auth/session-timing and asserts the timer behaviour against them, so
 *     the test does not hard-code the policy and the constants stay the single
 *     source of truth.
 *   - NFR5 (§10): API errors are never silently swallowed. A 401 from a protected
 *     call is the expired-session signal — it must sign the user out and route to
 *     the login screen, not fail silently (AC-3).
 *
 * Known spec gap (from planning): auth-api.yaml exposes no session-introspection
 * or expiry endpoint, so enforcement is CLIENT-SIDE only — driven by the timers
 * in this component, not by a server lifetime signal. These tests therefore
 * exercise timer-driven enforcement and a client-observed 401, never a server
 * "your session expired" payload.
 *
 * Integration with existing infra (do NOT re-test these — covered by their own
 * stories / the Epic 1 baseline):
 *   - SessionProvider (Story 1) — exposes clearSession() / refresh() / user /
 *     isLoading / error. Sign-out on expiry clears the in-memory session through
 *     clearSession() so the app re-resolves as unauthenticated and the /login
 *     hand-off is not bounced back to a role landing (see SessionProvider docs).
 *   - The app shell (Story 4) hosts this component.
 *
 * Sign-out hand-off is observed via the router (push to /login) — the literal
 * login route the rest of the app uses (AppShell, route-protection gate). The
 * end-to-end redirect + "session ended" explanation on the real login screen is
 * the Playwright AC-1/AC-2 concern.
 *
 * These tests WILL FAIL until SessionTimeout and @/lib/auth/session-timing are
 * implemented (TDD red).
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Production targets — will fail to import until implemented (TDD red).
import { SessionTimeout } from '@/components/shell/SessionTimeout';
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  ABSOLUTE_SESSION_CAP_MS,
} from '@/lib/auth/session-timing';
import { SessionProvider } from '@/components/auth/SessionProvider';
import { createMockImporterUserInfo } from '../helpers/epic-1-mock-data';

// Expiry hands off to the login screen via the router. Stub navigation so we can
// keep jsdom alive AND await the hand-off as the user-observable outcome.
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockPush, refresh: vi.fn() }),
  usePathname: () => '/dashboard',
}));

// SessionTimeout layers on the shell, which loads identity through the
// SessionProvider's same-origin userinfo fetch. A global fetch stub serves that
// mount load (and any logout the component issues on expiry through the
// same-origin proxy). Story 1 already covers the userinfo/logout boundary — here
// it only needs to resolve so the provider reports an authenticated user.
const mockFetch = vi.fn();

/** A 200 userinfo Response for an authenticated Importer. */
function importerUserinfo(): Response {
  return new Response(JSON.stringify(createMockImporterUserInfo()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * An APIError-shaped 401 as the shared API client throws it from a protected
 * call (web/src/lib/api/client.ts handleErrorResponse → statusCode 401). The
 * component reads statusCode to recognise an expired session.
 */
function unauthorizedApiError() {
  return {
    message: 'Unauthorized: Please log in to continue',
    statusCode: 401,
    details: ['Your session may have expired. Please log in again.'],
    endpoint: '/v1/transactions',
  };
}

/**
 * Renders SessionTimeout under the production session surface. The render prop
 * exposes the component's reporting hook so a protected call-site can hand it a
 * 401 — mirroring how a data-loading component would report an API error.
 */
function renderSessionTimeout(
  children?: (report: (error: unknown) => void) => React.ReactNode,
) {
  return render(
    <SessionProvider>
      <SessionTimeout>
        {children
          ? (report: (error: unknown) => void) => children(report)
          : null}
      </SessionTimeout>
    </SessionProvider>,
  );
}

/** Resolves once the SessionProvider has reported the authenticated user. */
async function waitForAuthenticated() {
  // The component renders its guarded subtree only once a session is present;
  // the warning/timeout machinery keys off an authenticated session.
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
}

describe('Epic 1, Story 5: Session lifecycle — idle warning and timeout handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(importerUserinfo());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // --- AC-3: a 401 from a protected request signs out + routes to /login ---

  // AC-3 / NFR5 — a 401 from any protected call is the expired-session signal.
  // The component must sign the user out and route to the login screen, never
  // fail silently. The 401 is fed in the APIError shape the shared client throws.
  it('routes to /login when a protected request reports a 401', async () => {
    let report: ((error: unknown) => void) | undefined;
    renderSessionTimeout((r) => {
      report = r;
      return <span>protected content</span>;
    });

    await waitForAuthenticated();
    expect(report).toBeDefined();

    // Simulate a protected request failing with a 401 (expired session).
    await act(async () => {
      report?.(unauthorizedApiError());
    });

    // The user-observable outcome: hand-off to the login screen — not a swallowed
    // error and not a stuck page.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  // AC-3 / NFR5 — a non-401 API error (e.g. a transient 500) must NOT be treated
  // as session expiry: it must not sign the user out or route to /login. This
  // pins the 401-only contract so the component does not over-trigger sign-out.
  it('does not route to /login when a protected request fails with a non-401 error', async () => {
    let report: ((error: unknown) => void) | undefined;
    renderSessionTimeout((r) => {
      report = r;
      return <span>protected content</span>;
    });

    await waitForAuthenticated();
    expect(report).toBeDefined();

    await act(async () => {
      report?.({
        message: 'Internal Server Error',
        statusCode: 500,
        details: ['Please try again later.'],
        endpoint: '/v1/transactions',
      });
    });

    // Give any (incorrect) async hand-off a chance to fire, then assert it didn't.
    await Promise.resolve();
    expect(mockPush).not.toHaveBeenCalledWith('/login');
  });

  // --- AC-4: idle + absolute thresholds enforced from documented timing values ---

  // AC-4 / NFR6 — the documented timing values are exposed as named constants
  // (not magic numbers) so policy lives in one place and is testable. This pins
  // the constants to the brief's NFR6 figures: 15-min idle, 60-s warning, 8-h cap.
  it('exposes the NFR6 timing values as named constants', () => {
    expect(IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(IDLE_WARNING_MS).toBe(60 * 1000);
    expect(ABSOLUTE_SESSION_CAP_MS).toBe(8 * 60 * 60 * 1000);
  });

  // AC-4 / NFR6 — after the idle threshold the user is warned BEFORE being signed
  // out: the warning surfaces IDLE_WARNING_MS before the idle timeout fires, and
  // not before. Asserted with fake timers against the named constants, so the
  // threshold (not a hard-coded duration) is what is enforced.
  it('surfaces the idle warning exactly IDLE_WARNING_MS before the idle timeout', async () => {
    vi.useFakeTimers();
    renderSessionTimeout(() => <span>protected content</span>);

    // Let the provider's mount fetch resolve under fake timers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Just before the warning lead-in, no warning yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - IDLE_WARNING_MS - 1);
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // Crossing the (idle timeout - warning lead-in) boundary surfaces the warning.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  // AC-4 / NFR6 — if the idle warning is ignored, the idle timeout fires at
  // IDLE_TIMEOUT_MS of inactivity and the user is signed out to /login. The
  // boundary is asserted against the named constant.
  it('signs out to /login when the idle timeout elapses with no activity', async () => {
    vi.useFakeTimers();
    renderSessionTimeout(() => <span>protected content</span>);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // One tick before the idle timeout, the user is still signed in (no hand-off).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1);
    });
    expect(mockPush).not.toHaveBeenCalledWith('/login');

    // Crossing the idle timeout boundary signs the user out to the login screen.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  // AC-4 / NFR6 — the absolute cap is enforced independently of activity: even a
  // continuously-active user is signed out once ABSOLUTE_SESSION_CAP_MS elapses
  // from session start. Activity is simulated so the idle timer keeps resetting;
  // only the absolute cap can end the session here.
  it('signs out to /login at the absolute session cap even with continuous activity', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTimeAsync,
    });
    renderSessionTimeout(() => <span>protected content</span>);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Keep the user active across the whole window in idle-sized steps so the idle
    // timer never fires; each activity resets idle but cannot reset the absolute
    // cap. Stop one step short of the cap and assert the user is still signed in.
    const step = IDLE_TIMEOUT_MS - IDLE_WARNING_MS;
    let elapsed = 0;
    while (elapsed + step < ABSOLUTE_SESSION_CAP_MS) {
      await user.keyboard('a'); // activity resets the idle timer
      await act(async () => {
        await vi.advanceTimersByTimeAsync(step);
      });
      elapsed += step;
    }
    expect(mockPush).not.toHaveBeenCalledWith('/login');

    // Advance past the absolute cap — the active user is signed out regardless.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ABSOLUTE_SESSION_CAP_MS - elapsed);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  // AC-1 client half / NFR6 — choosing "stay signed in" from the warning resets
  // the idle window: the warning is dismissed and the session is NOT signed out
  // when the original idle timeout instant passes. (The end-to-end warning UX and
  // the post-expiry "session ended" explanation are the Playwright AC-1/AC-2
  // concern; this asserts only the unit-observable reset.)
  it('dismisses the warning and keeps the session when the user chooses to stay signed in', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTimeAsync,
    });
    renderSessionTimeout(() => <span>protected content</span>);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Advance to the warning point.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
    });
    const dialog = await screen.findByRole('alertdialog');
    const stay = await screen.findByRole('button', {
      name: /stay signed in|keep me signed in|continue/i,
    });

    await user.click(stay);

    // Warning dismissed and the session preserved.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(dialog).not.toBeInTheDocument();

    // Advance past the ORIGINAL idle timeout instant — because the idle window was
    // reset, no sign-out fires here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_WARNING_MS + 1);
    });
    expect(mockPush).not.toHaveBeenCalledWith('/login');
  });
});
