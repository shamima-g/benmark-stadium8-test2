/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/(app)/layout.tsx
 * - Page Action: create_new
 *
 * Epic 1, Story 3: Role-based landing routing and route protection.
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - AC-1 (Importer lands on Dashboard / Approver lands on Transactions after
 *     sign-in), AC-2 (signed-out user on a protected route is redirected to
 *     /login), and AC-3 (role-lacking user sees an in-page permission-denied
 *     banner naming the missing permission, not a 403) are PLAYWRIGHT-covered.
 *     They depend on the App-Router (app) route group, server-side redirect
 *     behaviour, and live navigation, so they are asserted end-to-end in the
 *     companion spec web/e2e/epic-1-story-3-role-based-landing-route-protection.spec.ts
 *     and are NOT duplicated here.
 *   - AC-4 (role-to-landing mapping resolves correctly from the user's roles,
 *     defaulting safely when roles are ambiguous) is VITEST-covered and is the
 *     subject of this file. The mapping is a pure resolution function with no
 *     navigation side-effects, so it is unit-observable in isolation.
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R1 (§7): authenticated user is routed to a role-specific landing surface —
 *     "Importer -> Upload/Dashboard; Approver -> Transactions table".
 *   - §2 permissions matrix: BOTH Importer and Approver can "View Dashboard
 *     (File Log list)". The Dashboard is therefore the only landing surface
 *     every authenticated role can access, making it the safe default for
 *     ambiguous role sets (none / unknown / multiple) — an ambiguous user is
 *     never stranded on a surface their role cannot see (NFR5: no silently
 *     broken state).
 *   - §13 Notes: the live backend's role names are unconfirmed (the spec example
 *     returns RolesString='Viewer'). Resolution must therefore default safely on
 *     an unrecognised role rather than throw or return an undefined route.
 *
 * Target module under test: web/src/lib/auth/landing.ts — `resolveLandingRoute`
 * (consumed by the (app) layout to compute the post-login destination). This
 * import WILL FAIL until the module is implemented (TDD red).
 */
import { describe, it, expect } from 'vitest';
import { resolveLandingRoute } from '@/lib/auth/landing';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';

describe('resolveLandingRoute (Epic 1, Story 3 / AC-4)', () => {
  // AC-4: Importer resolves to the Dashboard landing.
  it('routes an Importer to the Dashboard', () => {
    const user = createMockAuthUser({ roles: ['Importer'] });
    expect(resolveLandingRoute(user)).toBe('/dashboard');
  });

  // AC-4: Approver resolves to the Transactions landing.
  it('routes an Approver to the Transactions screen', () => {
    const user = createMockAuthUser({ roles: ['Approver'] });
    expect(resolveLandingRoute(user)).toBe('/transactions');
  });

  // AC-4 (ambiguous roles, safe default): a user carrying BOTH roles is
  // ambiguous — there is no single role-specific landing. Resolution must fall
  // back to the surface every authenticated role can view (the Dashboard),
  // never stranding the user on an inaccessible screen.
  it('defaults a user with multiple roles to the Dashboard', () => {
    const user = createMockAuthUser({ roles: ['Importer', 'Approver'] });
    expect(resolveLandingRoute(user)).toBe('/dashboard');
  });

  // AC-4 (ambiguous roles, safe default): an empty role set (or a role the
  // backend returns that we do not recognise — §13 flags RolesString='Viewer'
  // as an unconfirmed live value) must resolve safely to the shared Dashboard
  // rather than throwing or returning an undefined route (NFR5).
  it('defaults safely to the Dashboard when the role set is empty or unrecognised', () => {
    expect(resolveLandingRoute(createMockAuthUser({ roles: [] }))).toBe(
      '/dashboard',
    );
    expect(resolveLandingRoute(createMockAuthUser({ roles: ['Viewer'] }))).toBe(
      '/dashboard',
    );
  });
});
