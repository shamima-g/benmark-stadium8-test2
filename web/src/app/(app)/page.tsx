'use client';

/**
 * Application root ('/') — Epic 1, Story 3.
 *
 * The root carries no content of its own. For an authenticated user it resolves
 * the role-specific landing (resolveLandingRoute: Importer -> Dashboard,
 * Approver -> Transactions, ambiguous -> Dashboard) and redirects there, so a
 * successful sign-in (the login form hands off to '/') always settles on the
 * correct landing surface (R1 §7, §9 step 3).
 *
 * The enclosing (app) layout handles the unauthenticated case (redirect to
 * /login) before this page renders, so by the time this runs a user is present.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useSession } from '@/components/auth/SessionProvider';
import { resolveLandingRoute } from '@/lib/auth/landing';

export default function RootLandingPage() {
  const { user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace(resolveLandingRoute(user));
    }
  }, [user, router]);

  // Nothing to show — the redirect to the role-specific landing happens above.
  return null;
}
