'use client';

/**
 * SessionProvider — the single source of authenticated identity for the app.
 *
 * On mount it loads the authenticated user's profile from the same-origin BFF
 * proxy (`GET /api/auth/userinfo`) and normalises the BFF's PascalCase
 * UserInfoRead payload into the flat, client-facing `AuthUser` shape
 * ({ email, name, roles }) that descendants consume via `useSession()`.
 *
 * Transport: the userinfo proxy is a *same-origin* Next.js route handler, so it
 * is called with a plain same-origin `fetch('/api/auth/userinfo')` — NOT the
 * shared API client (`@/lib/api/client`). The shared client prepends the
 * external backend base URL (`NEXT_PUBLIC_API_BASE_URL`), which would resolve
 * the request to the BFF host cross-origin. The HttpOnly `session` cookie is
 * `SameSite=Strict` and same-origin, so it would never be sent on that
 * cross-origin request and the proxy handler would never run. CLAUDE.md §3
 * mandates the API client for *external* backend calls; the BFF same-origin
 * proxy routes are the documented exception — they must hit the app's own
 * origin, which a relative-path `fetch` guarantees.
 *
 * The HttpOnly `session` cookie is never read here — the browser attaches it
 * automatically to the same-origin request, and the proxy route handler
 * forwards it to the BFF server-side. This provider only ever sees the profile
 * JSON, never the token.
 *
 * Error handling (NFR5): failures are classified into a typed `AuthError`:
 *   - a 401 (no/expired session) resolves to an UNAUTHENTICATED state (null
 *     user, no surfaced error) — the absence of a session is not an error;
 *   - any other non-OK status (5xx) or a thrown network error surfaces as
 *     `kind: 'connectivity'` so the UI can offer a retry affordance rather than
 *     silently swallowing it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AuthError } from '@/lib/auth/errors';
import type { AuthUser, UserInfoRead } from '@/types/auth';

/** Same-origin BFF proxy endpoint that relays the session cookie server-side. */
const USERINFO_PROXY_PATH = '/api/auth/userinfo';

interface SessionContextValue {
  /** The authenticated user, or null when unauthenticated / still loading. */
  user: AuthUser | null;
  /** A typed auth error to surface (credential vs connectivity), or null. */
  error: AuthError | null;
  /** True while the initial userinfo fetch is in flight. */
  isLoading: boolean;
  /** Re-fetches userinfo — used by retry affordances on connectivity errors. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

/** Normalises the BFF UserInfoRead payload into the client-facing AuthUser. */
function normaliseUser(info: UserInfoRead): AuthUser {
  const name = [info.FirstName, info.LastName]
    .filter((part) => part && part.trim().length > 0)
    .join(' ');
  const roles = Array.isArray(info.Roles)
    ? info.Roles.map((role) => role.Name).filter(Boolean)
    : [];
  return { email: info.Email, name, roles };
}

/**
 * Resolves the userinfo proxy response into one of three outcomes:
 *   - { user }            — authenticated profile loaded
 *   - { user: null }      — 401: no active session (unauthenticated, not error)
 *   - throws AuthError    — any other non-OK status → connectivity failure
 */
async function loadUserinfo(): Promise<{ user: AuthUser | null }> {
  // Same-origin relative fetch: hits the app's own origin so the HttpOnly,
  // SameSite=Strict session cookie is attached automatically. credentials
  // defaults to 'same-origin', which is exactly what we want here.
  const res = await fetch(USERINFO_PROXY_PATH, { method: 'GET' });

  // 401 means there is simply no active session — not an error condition.
  if (res.status === 401) {
    return { user: null };
  }

  if (!res.ok) {
    throw new AuthError(
      'connectivity',
      'Unable to reach the authentication service',
    );
  }

  const info = (await res.json()) as UserInfoRead;
  return { user: normaliseUser(info) };
}

/**
 * Classifies a thrown value from the userinfo fetch.
 * Returns either an unauthenticated signal (null) or a typed AuthError.
 */
function classifyError(err: unknown): AuthError {
  // An explicit typed error is passed through verbatim.
  if (err instanceof AuthError) {
    return err;
  }
  // Anything else (network failure, unexpected) is a connectivity problem.
  const message =
    err instanceof Error
      ? err.message
      : 'Unable to reach the authentication service';
  return new AuthError('connectivity', message);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { user: loaded } = await loadUserinfo();
      setUser(loaded);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(classifyError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const value: SessionContextValue = {
    user,
    error,
    isLoading,
    refresh: loadSession,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/**
 * Reads the authenticated session. Must be called within a SessionProvider;
 * throws otherwise so a stray consumer fails loudly rather than reading an
 * undefined context.
 */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
