/**
 * Role-to-landing resolution (Epic 1, Story 3 / AC-4).
 *
 * Pure function — no navigation side effects — so it is unit-observable in
 * isolation. The `(app)` route group's root page consumes it to compute the
 * post-login destination, then redirects there.
 *
 * Keying strategy (single source of truth): resolution reads the user's GRANTED
 * ROUTE SET (AuthUser.routes — PageRead.Route from the userinfo payload), the
 * SAME signal the (app) layout gate uses to authorise a route. Keeping the
 * resolver and the gate on one signal means a user is always landed on a surface
 * they are actually authorised to see, and makes resolution robust to the §13
 * caveat that the live backend's role NAMES are unconfirmed (the spec example
 * returns RolesString='Viewer'). We never key the landing off role names.
 *
 * Mapping (R1 §7, project-brief §2):
 *   - A user who can access the Dashboard lands there (Importer; every role can
 *     View Dashboard per the §2 permission matrix, so this is also the safe
 *     default for an ambiguous/multi-role user).
 *   - Otherwise a user who can access Transactions lands there (Approver, whose
 *     granted set excludes the Dashboard).
 *
 * Safe default (NFR5, project-brief §13): when the granted set contains neither
 * known landing (empty set, or only unrecognised routes), resolution falls back
 * to the Dashboard rather than throwing or returning an undefined route, so the
 * user is never stranded on an inaccessible surface.
 */
import type { AuthUser } from '@/types/auth';
import { DASHBOARD_ROUTE, TRANSACTIONS_ROUTE } from '@/lib/auth/routes';

/**
 * Resolves the role-specific landing route for an authenticated user from their
 * granted route set (the same signal the route-protection gate uses).
 *
 * Preference order: Dashboard (universally accessible, and the safe default) →
 * Transactions (the Approver-only surface) → Dashboard fallback.
 */
export function resolveLandingRoute(user: AuthUser): string {
  const routes = Array.isArray(user.routes) ? user.routes : [];

  // A user who can reach the Dashboard lands there. Because every authenticated
  // role can View Dashboard (§2), this also safely covers ambiguous/multi-role
  // users — they land on the surface everyone can see.
  if (routes.includes(DASHBOARD_ROUTE)) {
    return DASHBOARD_ROUTE;
  }

  // Otherwise, a user granted only the Transactions surface (the Approver) lands
  // there — the same route their gate authorises.
  if (routes.includes(TRANSACTIONS_ROUTE)) {
    return TRANSACTIONS_ROUTE;
  }

  // Empty / unrecognised granted set -> the shared, safe default (NFR5, §13).
  return DASHBOARD_ROUTE;
}
