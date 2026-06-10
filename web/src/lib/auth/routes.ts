/**
 * Protected-route registry for the authenticated `(app)` shell.
 *
 * The application's protected surfaces live under the App-Router `(app)` route
 * group. Access to each is gated by the user's granted Pages (PageRead.Route
 * from the BFF userinfo payload — see web/src/types/auth.ts). This registry maps
 * each protected route to a human-readable page name so the permission-denied
 * banner can name the missing permission (project-brief §2: "an in-page
 * permission-denied banner naming the missing permission; a generic 403 error
 * page is not used").
 *
 * Role → landing mapping (R1 §7, project-brief §2): the post-login destination
 * is role-specific — an Importer lands on the Dashboard, an Approver on the
 * Transactions screen. Both roles can View Dashboard (§2 permission matrix), so
 * the Dashboard is the only universally-accessible landing and therefore the
 * safe default for an ambiguous role set (none / multiple / unrecognised) —
 * NFR5: an ambiguous user is never stranded on a surface their role cannot see.
 */

/** Importer landing surface (Dashboard / File Log list). */
export const DASHBOARD_ROUTE = '/dashboard';

/** Approver landing surface (Transactions table). */
export const TRANSACTIONS_ROUTE = '/transactions';

/**
 * The application root. It carries no content of its own — it resolves the
 * role-specific landing and redirects there — so it is never permission-gated.
 */
export const ROOT_ROUTE = '/';

/** Human-readable names for protected routes, used by the denial banner. */
const ROUTE_NAMES: Record<string, string> = {
  [DASHBOARD_ROUTE]: 'Dashboard',
  [TRANSACTIONS_ROUTE]: 'Transactions',
};

/**
 * The display name for a protected route (e.g. '/dashboard' -> 'Dashboard'),
 * used to name the missing permission in the denial banner. Falls back to the
 * raw route when the route is not in the registry so the banner is never blank.
 */
export function routeDisplayName(route: string): string {
  return ROUTE_NAMES[route] ?? route;
}
