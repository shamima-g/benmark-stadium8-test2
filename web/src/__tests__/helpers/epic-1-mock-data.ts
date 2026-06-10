/**
 * Shared mock-data factories for Epic 1 (Authentication & Application Shell).
 *
 * Created by Story 1's test-generator. Subsequent stories in this epic import
 * from and extend this file — never duplicate these shapes per test file.
 *
 * Shapes are derived from documentation/auth-api.yaml (UserInfoRead / RoleRead /
 * PageRead). The auth API spec returns PascalCase fields (Email, FirstName,
 * RolesString, Roles[]); the session provider normalises those into a flat,
 * client-facing AuthUser ({ email, name, roles, routes }). Both shapes are
 * provided so tests can model the BFF-relayed payload and the normalised
 * consumer view.
 *
 * The normalised AuthUser is imported from @/types/auth (the production shape)
 * rather than redeclared here, so the factory always models exactly what the
 * route-protection gate and the landing resolver consume — including the
 * `routes` granted-route set (PageRead.Route) the gate keys off.
 */

import type { AuthUser } from '@/types/auth';
import { DASHBOARD_ROUTE, TRANSACTIONS_ROUTE } from '@/lib/auth/routes';

/**
 * The BFF /v1/auth/userinfo response shape, as documented in auth-api.yaml.
 * The provider consumes this and normalises it for client components.
 */
export interface UserInfoResponse {
  Id: number;
  Email: string;
  FirstName: string;
  LastName: string;
  RolesString: string;
  Roles: Array<{ Id: number; Name: string }>;
}

/**
 * Raw userinfo payload as the BFF returns it (PascalCase, nested Roles).
 * Default models an Importer; override Roles/RolesString for Approver tests.
 */
export const createMockUserInfoResponse = (
  overrides: Partial<UserInfoResponse> = {},
): UserInfoResponse => ({
  Id: 1,
  Email: 'importer@example.com',
  FirstName: 'Ingrid',
  LastName: 'Mporter',
  RolesString: 'Importer',
  Roles: [{ Id: 1, Name: 'Importer' }],
  ...overrides,
});

/**
 * The granted route set a role grants, mirroring the Pages the BFF userinfo
 * payload returns per persona (see the Story 3 Playwright fixtures):
 *   - Importer can reach both the Dashboard and Transactions surfaces.
 *   - Approver can reach only Transactions (the Dashboard is Importer-only,
 *     which is what exercises the permission-denied path).
 * Unrecognised roles (e.g. the §13 placeholder 'Viewer') grant no routes.
 */
const ROUTES_BY_ROLE: Record<string, string[]> = {
  Importer: [DASHBOARD_ROUTE, TRANSACTIONS_ROUTE],
  Approver: [TRANSACTIONS_ROUTE],
};

/** Derives the de-duplicated granted route set for a set of role names. */
function routesForRoles(roles: string[]): string[] {
  const routes = roles.flatMap((role) => ROUTES_BY_ROLE[role] ?? []);
  return Array.from(new Set(routes));
}

/**
 * Normalised AuthUser as the session provider exposes it to descendants
 * (the production @/types/auth shape). Default models an Importer.
 *
 * `routes` mirrors the gate-consumed granted-route set: when not overridden it
 * is derived from `roles` exactly as the BFF userinfo Pages would express it, so
 * fixtures that only specify `roles` still carry the route set the resolver and
 * the gate key off.
 */
export const createMockAuthUser = (
  overrides: Partial<AuthUser> = {},
): AuthUser => {
  const roles = overrides.roles ?? ['Importer'];
  return {
    email: 'importer@example.com',
    name: 'Ingrid Mporter',
    roles,
    routes: routesForRoles(roles),
    ...overrides,
  };
};
