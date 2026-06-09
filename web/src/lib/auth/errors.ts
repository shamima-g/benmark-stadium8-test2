/**
 * Typed authentication errors.
 *
 * Auth failures fall into two user-distinguishable kinds (NFR5): a `credential`
 * failure (bad/expired session or wrong credentials — the user must sign in
 * again) versus a `connectivity` failure (the auth service is unreachable — the
 * user should retry). Surfacing the kind lets the UI offer the right
 * affordance instead of a generic "something went wrong".
 */

/** Machine-readable discriminant for the two auth failure modes. */
export type AuthErrorKind = 'credential' | 'connectivity';

/**
 * An authentication error carrying a machine-readable `kind`. Callers branch on
 * `kind` to distinguish a credential failure (re-authenticate) from a
 * connectivity failure (retry). Extends the native Error so it is throwable and
 * `instanceof Error`.
 */
export class AuthError extends Error {
  readonly kind: AuthErrorKind;

  constructor(kind: AuthErrorKind, message: string) {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
    // Restore the prototype chain so `instanceof AuthError` holds after the
    // TypeScript -> ES5/ES6 down-level transform.
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/** Type guard for narrowing an unknown thrown value to AuthError. */
export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}
