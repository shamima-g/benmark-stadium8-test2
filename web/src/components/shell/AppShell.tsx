'use client';

/**
 * AppShell — the persistent application shell for every protected `(app)` surface
 * (Epic 1, Story 4).
 *
 * Rendered inside the protected `(app)` layout so all authenticated pages inherit
 * a consistent header, role-gated navigation, identity display, sign-out, and a
 * privacy-policy link. The shell does NOT introduce its own `<main>` landmark —
 * the root layout already provides the single `<main>` region (NFR1) and the
 * page content (this component's `children`) renders inside it.
 *
 * Navigation is DATA-DRIVEN (project-brief §2 / R1 §7): it renders exactly the
 * routes present in the signed-in user's granted-route set (AuthUser.routes,
 * derived from the BFF userinfo Pages — the SAME signal Story 3's gate and
 * landing resolver consume). Denied destinations are HIDDEN, never rendered as
 * disabled controls (§2): a route absent from the granted set produces no nav
 * link at all. Labels come from the protected-route registry (routeDisplayName),
 * so adding a destination is a registry change, not a shell change.
 *
 * Identity (§2 / NFR1): the signed-in user's name and email are shown together
 * in a single element so the shell surfaces "the user's name or email".
 *
 * Responsive (NFR3): at and above the tablet breakpoint (768px / Tailwind `md`)
 * the destinations render inline in the header bar. Below it the inline nav is
 * hidden and the destinations collapse behind a menu trigger that opens a Sheet
 * drawer — so there is no horizontal overflow on mobile.
 *
 * Accessibility (NFR1 / NFR4): the navigation is a labelled `<nav>` landmark of
 * real links, each carrying a visible text label (accessible name); the menu
 * trigger and sign-out controls carry accessible names; everything is
 * keyboard-operable (native links/buttons, native focus order — the nav does not
 * trap focus).
 *
 * Sign-out (project-brief §3, bff-auth-pattern.md Rule 8): the control POSTs to
 * the SAME-ORIGIN logout proxy (`POST /api/auth/logout`, Story 1) via a
 * relative-path `fetch` — NOT the shared API client (which prepends the external
 * backend base URL and would resolve cross-origin, dropping the SameSite=Strict
 * session cookie). On a successful (res.ok) logout the shell (1) CLEARS the
 * in-memory session so the app re-resolves as unauthenticated, then (2) hands
 * off to /login with a router REPLACE. Clearing the session first is essential:
 * the BFF logout only clears the server-side cookie, but the SessionProvider
 * still holds the signed-in user in memory. If we navigated without clearing it,
 * the protected `(app)` root/landing resolver would see a still-present user and
 * bounce straight back to the role landing, so /login would never stick. Using
 * `replace` (not `push`) also drops the protected surface from history so the
 * Back button cannot return to it. On failure it surfaces an inline error
 * (NFR5) and stays put rather than pretending the session was cleared.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MenuIcon, LogOutIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSession } from '@/components/auth/SessionProvider';
import { isNavigableRoute, routeDisplayName } from '@/lib/auth/routes';
import { cn } from '@/lib/utils';

/** Same-origin BFF proxy endpoint. Relative path keeps the session cookie. */
const LOGOUT_PROXY_PATH = '/api/auth/logout';

/** Where to return after a successful sign-out. */
const LOGIN_ROUTE = '/login';

const SIGN_OUT_ERROR_MESSAGE = 'We could not sign you out. Please try again.';

/** A single navigation destination derived from a granted route. */
interface NavDestination {
  route: string;
  label: string;
}

/**
 * Derives the ordered, de-duplicated nav destinations from the user's granted
 * route set. Each granted route becomes a labelled destination via the
 * protected-route registry; the shell renders exactly these and nothing else, so
 * denied destinations are simply absent (§2: hidden, not disabled).
 *
 * Non-navigable granted routes are skipped (isNavigableRoute): a dynamic-prefix
 * route such as '/files' is granted to authorise its '/files/<id>' sub-paths
 * (the gate, isRouteAuthorised) but has NO landing page of its own, so a nav
 * link to the bare prefix would 404. Such prefixes never become nav items — the
 * shell renders only routes that actually land somewhere.
 */
function destinationsFor(routes: string[] | undefined): NavDestination[] {
  const seen = new Set<string>();
  const destinations: NavDestination[] = [];
  for (const route of routes ?? []) {
    if (!route || seen.has(route) || !isNavigableRoute(route)) {
      continue;
    }
    seen.add(route);
    destinations.push({ route, label: routeDisplayName(route) });
  }
  return destinations;
}

/**
 * The single identity string shown in the shell. Combines the user's name and
 * email into one element so "the user's name or email" is always surfaced and so
 * the identity reads as a single, unambiguous label.
 */
function identityLabel(name: string, email: string): string {
  const trimmedName = name.trim();
  return trimmedName ? `${trimmedName} (${email})` : email;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, clearSession } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const destinations = destinationsFor(user?.routes);
  const identity = user ? identityLabel(user.name, user.email) : '';

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      // Same-origin relative fetch: hits the app's own origin so the HttpOnly,
      // SameSite=Strict session cookie is attached and the proxy can relay it to
      // the BFF and then clear it. NOT the shared API client (cross-origin).
      const res = await fetch(LOGOUT_PROXY_PATH, { method: 'POST' });

      // Rule 8: branch on the proxy response. A failed sign-out must not look
      // like a success — surface it and stay put rather than handing off.
      if (!res.ok) {
        setSignOutError(SIGN_OUT_ERROR_MESSAGE);
        return;
      }

      setIsMenuOpen(false);
      // Clear the in-memory session BEFORE navigating. The proxy cleared the
      // server-side cookie, but the SessionProvider still holds the signed-in
      // user; if we navigated with that user still present, the protected
      // root/landing resolver would bounce us straight back to the role landing
      // and /login would never stick. Clearing first makes the app resolve as
      // unauthenticated. `replace` (not `push`) drops the protected surface from
      // history so Back cannot return to it.
      clearSession();
      router.replace(LOGIN_ROUTE);
    } catch {
      setSignOutError(SIGN_OUT_ERROR_MESSAGE);
    } finally {
      setIsSigningOut(false);
    }
  }

  function renderNavLinks(onNavigate?: () => void) {
    return destinations.map((destination) => {
      const isActive = pathname === destination.route;
      return (
        <Link
          key={destination.route}
          href={destination.route}
          aria-current={isActive ? 'page' : undefined}
          onClick={onNavigate}
          className={cn(
            'rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground',
          )}
        >
          {destination.label}
        </Link>
      );
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger — visible only below the tablet breakpoint. */}
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open menu"
                >
                  <MenuIcon className="size-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <nav aria-label="Mobile" className="flex flex-col gap-1 px-2">
                  {renderNavLinks(() => setIsMenuOpen(false))}
                </nav>
              </SheetContent>
            </Sheet>

            <Link
              href="/"
              className="text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Transaction Import &amp; Approval
            </Link>

            {/* Desktop inline navigation — hidden below the tablet breakpoint. */}
            <nav
              aria-label="Primary"
              className="hidden items-center gap-1 md:flex"
            >
              {renderNavLinks()}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {identity && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {identity}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <LogOutIcon className="size-4" aria-hidden="true" />
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </div>

        {/* Inline, contextually-anchored sign-out failure region. Anchored in the
            shell header (next to the control that triggered it) rather than routed
            through the app toast: the error belongs beside its control, and the
            inline region is provider-independent so the shell behaves identically
            whether or not a toast provider happens to wrap the tree. */}
        {signOutError && (
          <div
            role="alert"
            className="mx-auto w-full max-w-7xl px-4 pb-3 text-sm text-destructive"
          >
            {signOutError}
          </div>
        )}
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-sm text-muted-foreground sm:flex-row">
          <span>Transaction Import &amp; Approval System</span>
          <Link
            href="/privacy-policy"
            className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}
