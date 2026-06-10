/**
 * Protected-route registry for the authenticated `(app)` shell.
 *
 * The application's protected surfaces live under the App-Router `(app)` route
 * group. Access to each is gated by the user's granted Pages (PageRead.Route
 * from the BFF userinfo payload — see web/src/types/auth.ts). This registry maps
 * each protected route to a human-readable page name so the permission-denied
 * banner can name the missing permission (project-brief §2: "an in-page
 * permission-denied banner naming the missing permission; a generic 403 error
 * page is not used") and so the data-driven shell navigation (Story 4) can label
 * each granted destination.
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
 * File-upload surface (Importer-only per project-brief §2 / BR10). The Upload
 * page itself is built in Epic 2; this route is registered here only so the
 * data-driven shell nav (Story 4) renders a human-readable label when an
 * Importer's granted Pages include it.
 */
export const UPLOAD_ROUTE = '/upload';

/**
 * File-detail surface PREFIX (project-brief §2 — both roles can "drill into a
 * file's transactions"). The detail page lives at the DYNAMIC route /files/[id],
 * so the BFF userinfo payload grants this PREFIX ('/files') rather than every
 * concrete id, and the (app) gate treats a granted '/files' as authorising any
 * '/files/<id>' (prefix authorisation — see isRouteAuthorised). Registered here
 * so the denial banner can label the surface.
 *
 * It is intentionally NOT a navigable destination: no page resolves at the bare
 * '/files' prefix (only '/files/[id]' exists), so a nav link to '/files' would
 * 404. It is therefore listed in DYNAMIC_ROUTE_PREFIXES (gate-only) and excluded
 * from the shell nav by isNavigableRoute — the gate still authorises concrete
 * '/files/<id>' paths, but the shell never renders a 'File detail' nav item.
 */
export const FILE_DETAIL_ROUTE = '/files';

/**
 * The application root. It carries no content of its own — it resolves the
 * role-specific landing and redirects there — so it is never permission-gated.
 */
export const ROOT_ROUTE = '/';

/**
 * Granted routes that are DYNAMIC-CAPABLE prefixes: a granted entry authorises
 * not just the exact path but any sub-path under '<prefix>/' (e.g. a granted
 * '/files' authorises '/files/123'). Only these routes get prefix treatment;
 * every other granted route still requires an EXACT match, so a genuinely
 * unauthorised fixed route (Epic 1 Story 3 AC-3) still shows the denial banner.
 *
 * A dynamic prefix has NO landing page of its own (only its '/<prefix>/<id>'
 * sub-paths resolve), so it is also non-navigable — see isNavigableRoute, which
 * keeps such prefixes out of the shell nav while leaving gate authorisation for
 * their sub-paths intact.
 */
const DYNAMIC_ROUTE_PREFIXES = [FILE_DETAIL_ROUTE] as const;

/**
 * Decides whether a pathname is authorised given the user's granted route set.
 *
 * A route is authorised when the granted set includes it EXACTLY, OR when the
 * pathname is a sub-path of a granted dynamic-capable prefix (e.g. granted
 * '/files' authorises '/files/123'). Fixed routes keep their exact-match
 * semantics so an unauthorised fixed route still surfaces the permission-denied
 * banner (Epic 1 Story 3 AC-3) and role-gated nav (Story 4) is unchanged.
 */
export function isRouteAuthorised(
  pathname: string,
  grantedRoutes: readonly string[],
): boolean {
  if (grantedRoutes.includes(pathname)) {
    return true;
  }
  return DYNAMIC_ROUTE_PREFIXES.some(
    (prefix) =>
      grantedRoutes.includes(prefix) && pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Whether a granted route is a real, navigable landing — i.e. a page resolves at
 * the route itself, so a nav link to it lands somewhere rather than 404ing.
 *
 * Dynamic-capable prefixes (DYNAMIC_ROUTE_PREFIXES, e.g. '/files') have no
 * landing page of their own — only their '/<prefix>/<id>' sub-paths resolve — so
 * a shell nav link to the bare prefix would 404. They are authorised by the gate
 * (isRouteAuthorised) for their sub-paths but are NOT navigable, so the
 * data-driven shell nav (Story 4) filters them out via this predicate. Every
 * other granted route is navigable.
 */
export function isNavigableRoute(route: string): boolean {
  return !DYNAMIC_ROUTE_PREFIXES.includes(
    route as (typeof DYNAMIC_ROUTE_PREFIXES)[number],
  );
}

/**
 * Human-readable names for protected routes, used by the denial banner and the
 * data-driven shell navigation (Story 4) to label each granted destination.
 */
const ROUTE_NAMES: Record<string, string> = {
  [DASHBOARD_ROUTE]: 'Dashboard',
  [TRANSACTIONS_ROUTE]: 'Transactions',
  [UPLOAD_ROUTE]: 'Upload',
  [FILE_DETAIL_ROUTE]: 'File detail',
};

/**
 * The display name for a protected route (e.g. '/dashboard' -> 'Dashboard'),
 * used to name the missing permission in the denial banner and to label nav
 * destinations. Falls back to the raw route when the route is not in the
 * registry so the label is never blank. A concrete file-detail path
 * ('/files/123') resolves to the File-detail surface label.
 */
export function routeDisplayName(route: string): string {
  if (ROUTE_NAMES[route]) {
    return ROUTE_NAMES[route];
  }
  if (route.startsWith(`${FILE_DETAIL_ROUTE}/`)) {
    return ROUTE_NAMES[FILE_DETAIL_ROUTE];
  }
  return route;
}
