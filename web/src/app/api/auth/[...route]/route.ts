/**
 * BFF auth proxy — catch-all route handler.
 *
 * Proxies the sign-in / sign-out / userinfo flows between the browser and the
 * BFF so the HttpOnly `session` cookie stays strictly server-side. The browser
 * never receives the raw session token in JavaScript; it is written as an
 * HttpOnly cookie by these handlers and relayed back to the BFF on subsequent
 * requests.
 *
 * Routes (under /api/auth):
 *   POST /api/auth/login    — maps form `email` -> BFF `Username`, forwards
 *                             credentials, relays the BFF Set-Cookie as an
 *                             HttpOnly cookie. Never echoes the token in the body.
 *   POST /api/auth/logout   — forwards the session to the BFF, then clears the
 *                             cookie with matching attributes + Max-Age=0.
 *   GET  /api/auth/userinfo — forwards the session cookie to the BFF and returns
 *                             the profile.
 *
 * Security invariants (bff-auth-pattern.md):
 *   - The session cookie is HttpOnly; client JS can never read it.
 *   - Logout branches on the BFF response (Rule 8) before clearing.
 *   - The cookie is cleared with the same attributes it was set with (Rule 9).
 *   - The session token is never serialised into a response body.
 *
 * Error envelope: lowercase `{ error, message }` per bff-auth-pattern.md so the
 * proxy conforms to the documented BFF contract. Clients key off the HTTP
 * status code, not the body shape.
 */
import { cookies } from 'next/headers';
import { bff } from '@/lib/auth/bffClient';
import type { LoginRequest } from '@/types/auth';

const SESSION_COOKIE = 'session';

/** Cookie attributes shared by the set-on-login and clear-on-logout paths. */
const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.BFF_INSECURE_COOKIE !== '1',
  sameSite: 'strict' as const,
  path: '/',
};

/** Extracts the route segment (login | logout | userinfo) from the catch-all params. */
function resolveAction(route: string[] | undefined): string {
  return route && route.length > 0 ? route[route.length - 1] : '';
}

/** Pulls the named cookie value out of a BFF Set-Cookie header list. */
function readSetCookieValue(
  res: Response,
  name: string,
): { value: string; maxAge?: number } | null {
  const header = res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`));
  if (!header) return null;
  const value = header.split(';', 1)[0].slice(name.length + 1);
  const maxAge = header.match(/Max-Age=(\d+)/i)?.[1];
  return { value, maxAge: maxAge ? parseInt(maxAge, 10) : undefined };
}

type RouteContext = { params: Promise<{ route: string[] }> };

export async function POST(req: Request, context: RouteContext) {
  const { route } = await context.params;
  const action = resolveAction(route);

  if (action === 'login') {
    return handleLogin(req);
  }
  if (action === 'logout') {
    return handleLogout();
  }
  return jsonError(404, 'NOT_FOUND', `Unknown auth route: ${action}`);
}

export async function GET(req: Request, context: RouteContext) {
  const { route } = await context.params;
  const action = resolveAction(route);

  if (action === 'userinfo') {
    return handleUserinfo();
  }
  return jsonError(404, 'NOT_FOUND', `Unknown auth route: ${action}`);
}

/** POST /api/auth/login — proxy credentials, relay the session cookie. */
async function handleLogin(req: Request): Promise<Response> {
  let credentials: { email?: string; password?: string };
  try {
    credentials = await req.json();
  } catch {
    return jsonError(400, 'INVALID_REQUEST', 'Malformed request body.');
  }

  const { email, password } = credentials;
  if (!email || !password) {
    return jsonError(
      400,
      'INVALID_REQUEST',
      'Email and password are required.',
    );
  }

  // Map the form-facing `email` to the BFF's `Username` field.
  const loginBody: LoginRequest = { Username: email, Password: password };

  const res = await bff('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(loginBody),
  });

  if (!res.ok) {
    // Generic message — never reveal which field was wrong (auth-api.yaml).
    return jsonError(
      res.status === 401 ? 401 : 500,
      res.status === 401 ? 'INVALID_CREDENTIALS' : 'INTERNAL_SERVER_ERROR',
      res.status === 401
        ? 'Invalid email or password.'
        : 'Unable to sign in. Please try again.',
    );
  }

  // Relay the BFF session cookie as an HttpOnly cookie. The token is written
  // server-side only and is deliberately never serialised into the JSON body.
  const setCookie = readSetCookieValue(res, SESSION_COOKIE);
  if (!setCookie) {
    return jsonError(
      500,
      'INTERNAL_SERVER_ERROR',
      'Sign-in succeeded but no session was issued.',
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, setCookie.value, {
    ...sessionCookieOptions,
    maxAge: setCookie.maxAge,
  });

  return Response.json({ Messages: ['Login successful'] }, { status: 200 });
}

/** POST /api/auth/logout — forward to the BFF, then clear the cookie. */
async function handleLogout(): Promise<Response> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);

  if (session) {
    const res = await bff('/v1/auth/logout', {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=${session.value}` },
    });
    // Rule 8: branch on the BFF response — a failed logout must not look like a
    // success. Surface the failure rather than clearing the cookie blindly.
    if (!res.ok) {
      return jsonError(
        500,
        'INTERNAL_SERVER_ERROR',
        'Unable to sign out. Please try again.',
      );
    }
  }

  // Rule 9: clear with the same attributes the cookie was set with + Max-Age=0.
  cookieStore.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });

  return Response.json({ Messages: ['Logout successful'] }, { status: 200 });
}

/** GET /api/auth/userinfo — forward the session cookie and return the profile. */
async function handleUserinfo(): Promise<Response> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);

  if (!session) {
    return jsonError(401, 'SESSION_INVALID', 'Not authenticated.');
  }

  const res = await bff('/v1/auth/userinfo', {
    method: 'GET',
    headers: { Cookie: `${SESSION_COOKIE}=${session.value}` },
  });

  if (!res.ok) {
    return jsonError(
      res.status === 401 ? 401 : 500,
      res.status === 401 ? 'SESSION_INVALID' : 'INTERNAL_SERVER_ERROR',
      res.status === 401
        ? 'Session expired or invalid.'
        : 'Unable to load your profile. Please try again.',
    );
  }

  const profile = await res.json();
  return Response.json(profile, { status: 200 });
}

/**
 * Builds a JSON error response in the BFF error-envelope shape
 * (`{ error, message }`, lowercase keys — bff-auth-pattern.md).
 */
function jsonError(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}
