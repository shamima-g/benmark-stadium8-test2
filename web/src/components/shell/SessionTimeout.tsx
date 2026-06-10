'use client';

/**
 * SessionTimeout — client-side session-lifecycle enforcement (Epic 1, Story 5 /
 * NFR5, NFR6).
 *
 * Layered on the protected shell so it is active across every authenticated
 * surface. It enforces three things, all CLIENT-SIDE (auth-api.yaml exposes no
 * session-introspection/expiry endpoint, so there is no server remaining-lifetime
 * signal to consult — enforcement is timer-driven only):
 *
 *   1. Idle timeout (NFR6): after IDLE_TIMEOUT_MS of inactivity the session ends.
 *      IDLE_WARNING_MS before that, a role="alertdialog" warning surfaces with a
 *      "Stay signed in" action that resets the idle window. Any real user
 *      activity (keydown / pointer) also resets the idle window and dismisses a
 *      showing warning.
 *   2. Absolute cap (NFR6): ABSOLUTE_SESSION_CAP_MS from session start the session
 *      ends regardless of activity — even a continuously-active user is signed
 *      out.
 *   3. 401-on-protected-call (NFR5): a protected request that fails with a 401 is
 *      the expired-session signal. Call-sites report the API error through the
 *      render-prop `report` callback; a 401 (and ONLY a 401) ends the session.
 *      Non-401 errors (e.g. a transient 500) are NOT treated as expiry.
 *
 * Timer clock (deterministic E2E contract): all timing uses the GLOBAL browser
 * clock — setTimeout / setInterval / Date.now() — NOT performance.now() or a
 * server timer, so Playwright's `page.clock.install()` + `fastForward` can drive
 * the lifecycle deterministically in the companion spec.
 *
 * Stable timer machinery: every callback that the lifecycle effect uses
 * (`armIdleWindow`, `scheduleIdleTimers`, `expireSession`) has a STABLE identity
 * (empty-dep useCallback) and reaches the current router / clearSession through
 * refs that are written AFTER commit (a no-dep effect), never during render. This
 * is deliberate — the next/navigation router hook returns a fresh object on every
 * render, so a router-dependent callback would change each render and tear down +
 * re-arm the timers on every re-render (e.g. when the warning toggles), clearing
 * the in-flight warning/expiry timers so the session could never actually expire.
 * With stable callbacks the lifecycle effect is keyed only on whether the session
 * is active and the timers run uninterrupted.
 *
 * Sign-out on expiry (bff-auth-pattern.md Rule 8): the same-origin BFF logout
 * proxy is POSTed (`POST /api/auth/logout`) to clear the server-side session,
 * then the in-memory session is cleared via useSession().clearSession() (so the
 * app re-resolves as unauthenticated and the /login hand-off is not bounced back
 * to a role landing — see SessionProvider), then the router hands off to /login.
 * The "session ended" reason is carried to the login screen via sessionStorage
 * (SESSION_ENDED_STORAGE_KEY) rather than a URL query param, so the hand-off
 * route stays exactly `/login` (the single, unadorned login route the gate and
 * sign-out flow share) while the login screen can still explain the timeout.
 *
 * Activation: the lifecycle only runs for an authenticated session (a present
 * user, not loading). An unauthenticated tree arms no timers and shows no
 * warning.
 *
 * Render prop: children may be a function `(report) => ReactNode` so a protected
 * data-loading call-site can hand this component its API error to classify
 * (AC-3). The render-prop is invoked inside a dedicated child component
 * (`ReportingChildren`) rather than in this component's render body, so the
 * `report` callback — which reaches timer refs at CALL time, never during render —
 * is handed to the consumer as a plain prop rather than read during this render.
 * Plain children (or none) are rendered as-is.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import { useSession } from '@/components/auth/SessionProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ABSOLUTE_SESSION_CAP_MS,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  SESSION_ENDED_STORAGE_KEY,
  SESSION_ENDED_TIMEOUT,
} from '@/lib/auth/session-timing';

/** Same-origin BFF proxy endpoint. Relative path keeps the session cookie. */
const LOGOUT_PROXY_PATH = '/api/auth/logout';

/** Where the user lands after a session ends — the single, unadorned login route. */
const LOGIN_ROUTE = '/login';

/** Lead-in (ms) at which the idle warning surfaces before the idle timeout. */
const WARNING_AT_MS = IDLE_TIMEOUT_MS - IDLE_WARNING_MS;

/** The DOM events that count as user activity and reset the idle window. */
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'keydown',
  'pointerdown',
  'mousemove',
  'wheel',
  'touchstart',
];

type ReportFn = (error: unknown) => void;
type RenderProp = (report: ReportFn) => ReactNode;

/** Narrowing guard: an API error whose statusCode is 401 (expired session). */
function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode?: unknown }).statusCode === 401
  );
}

/** Records the timeout reason so the login screen can explain the hand-off. */
function markSessionEnded(): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        SESSION_ENDED_STORAGE_KEY,
        SESSION_ENDED_TIMEOUT,
      );
    }
  } catch {
    // sessionStorage may be unavailable (private mode / disabled storage). The
    // sign-out still proceeds; the login screen simply won't show the optional
    // explanation in that rare case.
  }
}

/**
 * Invokes a render-prop child with the `report` callback. Isolating this in its
 * own component keeps the render-prop invocation out of SessionTimeout's render
 * body: `report` reaches timer refs only when CALLED (later, from the consumer's
 * error handler), so handing it to the consumer here as a plain prop is not a
 * render-time ref read.
 */
function ReportingChildren({
  render,
  report,
}: {
  render: RenderProp;
  report: ReportFn;
}) {
  return <>{render(report)}</>;
}

export function SessionTimeout({
  children,
}: {
  children?: ReactNode | RenderProp | null;
}) {
  const { user, isLoading, clearSession } = useSession();
  const router = useRouter();

  const isActive = !isLoading && !!user;

  // The idle-warning surface is the only piece of timer state that drives the
  // render; everything else is timer bookkeeping held in refs so re-renders
  // don't re-arm the timers.
  const [isWarningOpen, setIsWarningOpen] = useState(false);

  // Latest router / clearSession reached through refs so the stable callbacks
  // below never need them as dependencies (see the file header — the router hook
  // returns a fresh object each render). The refs are written AFTER commit (a
  // no-dep effect runs on every commit), never during render, so they are never
  // mutated during the render pass; the stable callbacks only ever READ them
  // later, inside effects / timer callbacks, so they see the post-commit value.
  const routerRef = useRef(router);
  const clearSessionRef = useRef(clearSession);
  useEffect(() => {
    routerRef.current = router;
    clearSessionRef.current = clearSession;
  });

  // Timer handles + bookkeeping. Refs so the stable callbacks can clear/re-arm
  // them across renders without re-creating the callbacks.
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const absoluteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a double hand-off if two deadlines (or a 401) coincide.
  const expiringRef = useRef(false);

  /** Ends the session: clear the BFF cookie, clear in-memory state, hand off. */
  const expireSession = useCallback(async () => {
    if (expiringRef.current) {
      return;
    }
    expiringRef.current = true;
    setIsWarningOpen(false);

    // Clear the server-side session through the same-origin logout proxy. We
    // hand off to /login regardless of the proxy result so an unreachable proxy
    // never strands the user on a protected surface with a dead session — but we
    // do not pretend success: the client session is cleared either way.
    try {
      await fetch(LOGOUT_PROXY_PATH, { method: 'POST' });
    } catch {
      // Network failure on logout — the client session is still cleared below
      // and the user is still returned to /login; the server cookie will be
      // re-validated on the next sign-in.
    }

    // Record why we are returning to /login so the login screen can explain it.
    markSessionEnded();

    // Clear in-memory identity BEFORE navigating so the app re-resolves as
    // unauthenticated and the /login hand-off is not bounced back to a landing.
    clearSessionRef.current();
    routerRef.current.push(LOGIN_ROUTE);
  }, []);

  const clearIdleTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  /**
   * Schedules the idle timers from "now": the warning at WARNING_AT_MS and the
   * expiry IDLE_WARNING_MS after that. Pure timer bookkeeping — it does NOT touch
   * render state, so it is safe to call synchronously from the lifecycle effect
   * (no cascading render). The warning is only ever OPENED later, inside the
   * deferred timer callback. The absolute-cap timer is independent and is NOT
   * reset here.
   */
  const scheduleIdleTimers = useCallback(() => {
    if (expiringRef.current) {
      return;
    }
    clearIdleTimers();

    idleTimerRef.current = setTimeout(() => {
      setIsWarningOpen(true);
      warningTimerRef.current = setTimeout(() => {
        void expireSession();
      }, IDLE_WARNING_MS);
    }, WARNING_AT_MS);
  }, [clearIdleTimers, expireSession]);

  /**
   * (Re)arms the idle window in response to user activity or "stay signed in":
   * dismisses any showing warning so a fresh idle period starts clean, then
   * reschedules the idle timers. Distinct from the initial arm — the lifecycle
   * effect schedules timers directly via scheduleIdleTimers, with no warning to
   * dismiss at session start, so no synchronous setState runs in the effect body.
   * This runs only from event handlers (activity / "stay signed in"), where the
   * setState is a normal, non-cascading update.
   */
  const armIdleWindow = useCallback(() => {
    if (expiringRef.current) {
      return;
    }
    setIsWarningOpen(false);
    scheduleIdleTimers();
  }, [scheduleIdleTimers]);

  // Arm the full lifecycle once an authenticated session begins: the idle window
  // plus the activity listeners that reset it and the absolute-cap timer that
  // ends the session regardless of activity. Keyed only on `isActive` (the
  // callbacks are stable) so it does not re-run on unrelated re-renders.
  useEffect(() => {
    if (!isActive) {
      return;
    }

    expiringRef.current = false;
    scheduleIdleTimers();

    // Absolute cap from session start — independent of activity.
    absoluteTimerRef.current = setTimeout(() => {
      void expireSession();
    }, ABSOLUTE_SESSION_CAP_MS);

    // Any real user activity resets the idle window (and dismisses a showing
    // warning) but cannot reset the absolute cap.
    const onActivity = () => armIdleWindow();
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    return () => {
      clearIdleTimers();
      if (absoluteTimerRef.current) {
        clearTimeout(absoluteTimerRef.current);
        absoluteTimerRef.current = null;
      }
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [
    isActive,
    scheduleIdleTimers,
    armIdleWindow,
    expireSession,
    clearIdleTimers,
  ]);

  /** Reports an API error from a protected call-site (AC-3 / NFR5). */
  const report = useCallback(
    (error: unknown) => {
      if (isUnauthorized(error)) {
        void expireSession();
      }
      // Non-401 errors are surfaced by the call-site's own error UX; they are
      // explicitly NOT treated as session expiry here.
    },
    [expireSession],
  );

  /** "Stay signed in" — resets the idle window and dismisses the warning. */
  function handleStaySignedIn() {
    armIdleWindow();
  }

  return (
    <>
      {typeof children === 'function' ? (
        <ReportingChildren render={children as RenderProp} report={report} />
      ) : (
        children
      )}

      <AlertDialog open={isWarningOpen}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Still there?</AlertDialogTitle>
            <AlertDialogDescription>
              You have been inactive and will be signed out soon. Choose “Stay
              signed in” to keep your session, or you will be signed out due to
              inactivity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction type="button" onClick={handleStaySignedIn}>
              Stay signed in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
