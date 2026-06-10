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

import type { AuthUser, PageRead } from '@/types/auth';
import {
  DASHBOARD_ROUTE,
  TRANSACTIONS_ROUTE,
  UPLOAD_ROUTE,
} from '@/lib/auth/routes';

/**
 * A role as carried by the BFF userinfo payload. Mirrors RoleRead from
 * @/types/auth, including the optional nested `Pages` the session provider reads
 * to derive the granted-route set (PageRead.Route). Story 1 only needed Name;
 * Story 4's role-gated nav needs the Pages, so the shape carries them here as
 * the single source.
 */
export interface UserInfoRole {
  Id: number;
  Name: string;
  Pages?: PageRead[];
}

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
  Roles: UserInfoRole[];
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
 * Pages an Importer role grants — the Dashboard, Transactions, and the
 * Importer-only Upload surface (project-brief §2 / BR10). Upload is included so
 * the granted-route set is the single source of truth for the Importer-only
 * Upload CTA (the Epic-2 dashboard gates that CTA off /upload being granted),
 * matching the Playwright userinfo fixture and the BFF Pages contract.
 */
const IMPORTER_PAGES: PageRead[] = [
  { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
  { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
  { Id: 3, Name: 'Upload', Route: UPLOAD_ROUTE },
];

/** Pages an Approver role grants — Transactions only (no Dashboard). */
const APPROVER_PAGES: PageRead[] = [
  { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
];

/**
 * Importer userinfo payload with the role's `Pages` populated, so the session
 * provider derives the Importer's full granted-route set (Dashboard +
 * Transactions + Upload). Story 4's role-gated nav keys off these routes.
 */
export const createMockImporterUserInfo = (
  overrides: Partial<UserInfoResponse> = {},
): UserInfoResponse =>
  createMockUserInfoResponse({
    Email: 'importer@example.com',
    FirstName: 'Ingrid',
    LastName: 'Mporter',
    RolesString: 'Importer',
    Roles: [{ Id: 1, Name: 'Importer', Pages: IMPORTER_PAGES }],
    ...overrides,
  });

/**
 * Approver userinfo payload with the role's `Pages` populated. The Approver's
 * granted set excludes the Dashboard — exercising the role-gated-nav hidden path.
 */
export const createMockApproverUserInfo = (
  overrides: Partial<UserInfoResponse> = {},
): UserInfoResponse =>
  createMockUserInfoResponse({
    Email: 'approver@example.com',
    FirstName: 'Avery',
    LastName: 'Prover',
    RolesString: 'Approver',
    Roles: [{ Id: 2, Name: 'Approver', Pages: APPROVER_PAGES }],
    ...overrides,
  });

/**
 * The granted route set a role grants, mirroring the Pages the BFF userinfo
 * payload returns per persona (see the Story 3 Playwright fixtures):
 *   - Importer can reach the Dashboard, Transactions, and the Importer-only
 *     Upload surface (project-brief §2 / BR10) — so the granted-route set is the
 *     single source of truth for the Upload CTA.
 *   - Approver can reach only Transactions (the Dashboard is Importer-only,
 *     which is what exercises the permission-denied path).
 * Unrecognised roles (e.g. the §13 placeholder 'Viewer') grant no routes.
 */
const ROUTES_BY_ROLE: Record<string, string[]> = {
  Importer: [DASHBOARD_ROUTE, TRANSACTIONS_ROUTE, UPLOAD_ROUTE],
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
