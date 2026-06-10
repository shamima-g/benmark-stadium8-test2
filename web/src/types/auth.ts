/**
 * Authentication domain types.
 *
 * Shapes derived from documentation/auth-api.yaml (UserInfoRead / RoleRead /
 * PageRead). The BFF returns PascalCase fields; the session provider normalises
 * them into the flat, client-facing `AuthUser` shape used across the app.
 */

/** A single page/route a role grants access to (PageRead). */
export interface PageRead {
  Id: number;
  Name: string;
  Route: string;
}

/** A single role as returned by the BFF (RoleRead). */
export interface RoleRead {
  Id: number;
  Name: string;
  Pages?: PageRead[];
  LastChangedUser?: string;
  LastChangedDate?: string;
}

/**
 * The raw /v1/auth/userinfo payload as the BFF returns it (UserInfoRead,
 * PascalCase, nested Roles/Pages).
 */
export interface UserInfoRead {
  Id: number;
  Email: string;
  FirstName: string;
  LastName: string;
  RolesString: string;
  Roles: RoleRead[];
  Pages?: PageRead[];
  LastChangedUser?: string;
  LastChangedDate?: string;
}

/**
 * The normalised, client-facing user the session provider exposes to
 * descendants. `name` is the joined first/last name; `roles` is the flattened
 * set of role names sourced from `Roles[].Name`; `routes` is the de-duplicated
 * set of route strings the user may access (PageRead.Route from the user's own
 * Pages and from each granted role's Pages), used to gate protected routes.
 */
export interface AuthUser {
  email: string;
  name: string;
  roles: string[];
  /**
   * Granted route paths (PageRead.Route). Optional so unit fixtures that only
   * model roles remain valid; the session provider always populates it from the
   * userinfo payload.
   */
  routes?: string[];
}

/** Credentials submitted to the login proxy from the sign-in form. */
export interface LoginCredentials {
  email: string;
  password: string;
}

/** The BFF LoginRequest shape (PascalCase Username/Password). */
export interface LoginRequest {
  Username: string;
  Password: string;
}
