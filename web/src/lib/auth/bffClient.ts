/**
 * Server-side BFF transport.
 *
 * A thin fetch wrapper the Next.js auth route handlers proxy through. It runs
 * only on the server — `BFF_BASE_URL` is intentionally NOT `NEXT_PUBLIC_`, so
 * the browser never talks to the BFF directly and never sees the session token.
 *
 * Cookie forwarding is the caller's responsibility: pass an explicit `Cookie:`
 * header from the incoming request (the userinfo/logout handlers do this).
 * `credentials: 'include'` is a browser-fetch concept with no effect
 * server-side, so it is deliberately omitted.
 *
 * The BFF endpoint contract lives in documentation/auth-api.yaml
 * (POST /v1/auth/login, POST /v1/auth/logout, GET /v1/auth/userinfo).
 */

/** Base URL of the BFF runtime. Server-side only — never exposed to the browser. */
export const BFF_BASE_URL =
  process.env.BFF_BASE_URL || 'http://localhost:10010';

/**
 * Performs a server-side request against the BFF.
 *
 * @param path - BFF path beginning with `/` (e.g. `/v1/auth/login`)
 * @param init - Standard fetch init; `Content-Type: application/json` is set by
 *   default and may be overridden via `init.headers`.
 */
export async function bff(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${BFF_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}
