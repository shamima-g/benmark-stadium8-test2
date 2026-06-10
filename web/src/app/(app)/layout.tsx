'use client';

/**
 * Protected application shell — the `(app)` route group layout (Epic 1, Story 3
 * + Story 4 + Story 5).
 *
 * Every authenticated, role-gated surface in the app nests under this group
 * (later epics add /dashboard, /transactions, file detail, etc.). The route
 * group does not affect URLs; it scopes this layout to the protected pages
 * while /login and /privacy-policy remain public, outside the group.
 *
 * Three behaviours (R1 §7, NFR5, project-brief §2 / §9):
 *   - AC-2 Unauthenticated: once the session has loaded and no user is present,
 *     redirect to /login. Protected access is gated; there is no anonymous view
 *     of a protected route.
 *   - AC-3 Authenticated-but-unauthorised: a signed-in user reaching a route
 *     their granted Pages do not include sees an IN-PAGE permission-denied
 *     banner naming the missing permission — not a generic 403 page, and not a
 *     bounce to login (they are signed in). The application root '/' is never
 *     gated; it only resolves and redirects to the role-specific landing.
 *   - Authorised: render the page.
 *
 * Story 4: the persistent AppShell (header, role-gated nav, identity, sign-out,
 * privacy-policy link) wraps every protected surface here, so all `(app)` pages
 * inherit it. Both authorised page content and the permission-denied banner
 * render inside the shell, so a signed-in user who hits an unauthorised route
 * still has working navigation and sign-out rather than a bare banner.
 *
 * Story 5: SessionTimeout is mounted here, inside the shell, so client-side
 * session-lifecycle enforcement (idle warning + 15-min idle timeout + 8-hour
 * absolute cap, NFR6; sign-out-to-login on a 401 from a protected call, NFR5) is
 * active across EVERY protected surface. It is mounted above the authorised /
 * permission-denied branch so the lifecycle runs regardless of which protected
 * route the user is on. It only arms its timers for an authenticated session.
 *
 * Access is keyed off the user's granted route set (AuthUser.routes, derived
 * from PageRead.Route in the userinfo payload) rather than role names, so it is
 * robust to the §13 caveat that live role names may differ from the spec.
 * Authorisation is delegated to isRouteAuthorised (Epic 2, Story 3): fixed
 * routes still require an EXACT grant, while the dynamic file-detail surface
 * (/files/[id]) is authorised by a granted '/files' PREFIX — so a shared
 * file-detail page is reachable for both roles without broadening any fixed
 * route's exact-match gate (Epic 1 Story 3 AC-3 / Story 4 nav stay intact).
 *
 * The root layout already provides the single <main> landmark; this layout (and
 * the AppShell it renders) must not introduce a second one (NFR1 / a single main
 * region), so the banner and page content render as children of that landmark.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useSession } from '@/components/auth/SessionProvider';
import { PermissionDeniedBanner } from '@/components/auth/PermissionDeniedBanner';
import { AppShell } from '@/components/shell/AppShell';
import { SessionTimeout } from '@/components/shell/SessionTimeout';
import {
  ROOT_ROUTE,
  isRouteAuthorised,
  routeDisplayName,
} from '@/lib/auth/routes';

const LOGIN_ROUTE = '/login';

export default function ProtectedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // AC-2: once loading has settled with no session, bounce to the login screen.
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(LOGIN_ROUTE);
    }
  }, [isLoading, user, router]);

  // While the session resolves — and during the redirect for an unauthenticated
  // visitor — render nothing so a protected surface never flashes.
  if (isLoading || !user) {
    return null;
  }

  // The application root carries no gated content of its own; the (app) root
  // page resolves the role-specific landing and redirects there.
  const isRoot = pathname === ROOT_ROUTE;

  // AC-3: authenticated but the current route is not in the user's granted set.
  // isRouteAuthorised keeps EXACT match for fixed routes and adds PREFIX match
  // for the dynamic file-detail surface (a granted '/files' authorises
  // '/files/<id>'), so file-detail content renders for both roles while an
  // unauthorised fixed route still surfaces the denial banner.
  const grantedRoutes = user.routes ?? [];
  const isAuthorised = isRoot || isRouteAuthorised(pathname, grantedRoutes);

  return (
    <AppShell>
      <SessionTimeout>
        {isAuthorised ? (
          children
        ) : (
          <PermissionDeniedBanner pageName={routeDisplayName(pathname)} />
        )}
      </SessionTimeout>
    </AppShell>
  );
}
