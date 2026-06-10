/**
 * Session-lifecycle timing policy (Epic 1, Story 5 / NFR6).
 *
 * The brief's NFR6 (project-brief §10) is the single source of truth for the
 * session-management thresholds:
 *   - idle session timeout: 15 minutes
 *   - idle warning lead-in: 60 seconds before that idle timeout fires
 *   - absolute session cap: 8 hours from session start
 *
 * These are exported as NAMED CONSTANTS — not inlined magic numbers — so the
 * policy lives in exactly one place, the SessionTimeout component arms its
 * timers against them, and the vitest suite can pin the thresholds without
 * re-stating the durations. Changing the policy here changes it everywhere.
 *
 * All values are in MILLISECONDS so they feed straight into the global
 * setTimeout / setInterval / Date.now() clock the SessionTimeout component uses
 * (the browser clock Playwright's clock mock can fast-forward).
 */

/** Idle session timeout — 15 minutes of inactivity ends the session (NFR6). */
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Warning lead-in — the idle warning surfaces this long BEFORE the idle timeout
 * fires (NFR6: a 60-second warning). The warning therefore appears at
 * `IDLE_TIMEOUT_MS - IDLE_WARNING_MS` of inactivity and counts down to expiry.
 */
export const IDLE_WARNING_MS = 60 * 1000;

/**
 * Absolute session cap — 8 hours from session start. Enforced independently of
 * activity: even a continuously-active user is signed out once this elapses
 * (NFR6).
 */
export const ABSOLUTE_SESSION_CAP_MS = 8 * 60 * 60 * 1000;

/**
 * Cross-screen signal that the current return to /login was caused by a session
 * timeout (idle expiry, absolute-cap expiry, or a 401 on a protected call).
 *
 * SessionTimeout sets this in `sessionStorage` immediately before handing off to
 * /login, and the login screen reads + clears it on mount to surface a "your
 * session ended" explanation. sessionStorage (not a URL query param) is used so
 * the hand-off route stays exactly `/login` — the route-protection gate, the
 * sign-out flow, and the tests all treat `/login` as the single, unadorned login
 * route — while still carrying the reason across the client-side navigation
 * (sessionStorage persists across both soft navigations and a full reload within
 * the same tab).
 */
export const SESSION_ENDED_STORAGE_KEY = 'session-ended-reason';
export const SESSION_ENDED_TIMEOUT = 'timeout';
