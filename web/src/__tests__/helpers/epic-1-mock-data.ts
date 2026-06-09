/**
 * Shared mock-data factories for Epic 1 (Authentication & Application Shell).
 *
 * Created by Story 1's test-generator. Subsequent stories in this epic import
 * from and extend this file — never duplicate these shapes per test file.
 *
 * Shapes are derived from documentation/auth-api.yaml (UserInfoRead / RoleRead /
 * PageRead). The auth API spec returns PascalCase fields (Email, FirstName,
 * RolesString, Roles[]); the session provider normalises those into a flat,
 * client-facing AuthUser ({ email, name, roles }). Both shapes are provided so
 * tests can model the BFF-relayed payload and the normalised consumer view.
 */

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
 * The normalised, client-facing user the session provider exposes.
 * roles is the flattened set of role names (from Roles[].Name).
 */
export interface AuthUser {
  email: string;
  name: string;
  roles: string[];
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
 * Normalised AuthUser as the provider exposes it to descendants.
 * Default models an Importer.
 */
export const createMockAuthUser = (
  overrides: Partial<AuthUser> = {},
): AuthUser => ({
  email: 'importer@example.com',
  name: 'Ingrid Mporter',
  roles: ['Importer'],
  ...overrides,
});
