'use client';

/**
 * Protected application shell — the `(app)` route group layout (Epic 1, Story 3
 * + Story 4).
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
 * Access is keyed off the user's granted route set (AuthUser.routes, derived
 * from PageRead.Route in the userinfo payload) rather than role names, so it is
 * robust to the §13 caveat that live role names may differ from the spec.
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
import { ROOT_ROUTE, routeDisplayName } from '@/lib/auth/routes';

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
  const grantedRoutes = user.routes ?? [];
  const isAuthorised = isRoot || grantedRoutes.includes(pathname);

  return (
    <AppShell>
      {isAuthorised ? (
        children
      ) : (
        <PermissionDeniedBanner pageName={routeDisplayName(pathname)} />
      )}
    </AppShell>
  );
}
