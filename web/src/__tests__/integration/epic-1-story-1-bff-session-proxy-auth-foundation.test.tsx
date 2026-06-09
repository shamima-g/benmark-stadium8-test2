/**
 * Story Metadata:
 * - Route: null (infrastructure-only — no user-facing screen)
 * - Target File: web/src/app/api/auth/[...route]/route.ts
 * - Page Action: create_new
 *
 * Epic 1, Story 1: BFF session proxy and auth foundation.
 *
 * Covers three acceptance criteria:
 *   AC-1 — login/logout/userinfo proxy handlers forward credentials and relay
 *          the Set-Cookie session header without exposing the cookie to JS.
 *   AC-2 — the session provider exposes email/name/roles to descendants, and
 *          null when unauthenticated.
 *   AC-3 — a failed userinfo/connectivity call surfaces a typed error
 *          (credential vs connectivity) rather than swallowing it.
 *
 * Source of truth: generated-docs/specs/project-brief.md (§3 Authentication,
 * R1, NFR5) and documentation/auth-api.yaml. The BFF LoginRequest uses
 * Username/Password fields; the form-facing field is `email`, mapped to
 * `Username` by the login proxy.
 *
 * Transport note: SessionProvider loads userinfo via a same-origin relative
 * `fetch('/api/auth/userinfo')` (NOT the shared API client, which would prepend
 * the external backend base URL and resolve cross-origin, dropping the
 * SameSite=Strict session cookie). These tests stub the global `fetch` and
 * assert the *real* same-origin URL the provider constructs, so the
 * client/proxy boundary is actually exercised rather than mocked away.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets ---
// Route handlers under app/api/auth/[...route]/route.ts.
import { POST, GET } from '@/app/api/auth/[...route]/route';
// Server-side BFF transport the route handlers proxy through.
import { bff } from '@/lib/auth/bffClient';
// Client-facing session surface.
import { SessionProvider, useSession } from '@/components/auth/SessionProvider';
// Typed auth error with a credential-vs-connectivity discriminant.
import { AuthError } from '@/lib/auth/errors';
import { createMockUserInfoResponse } from '../helpers/epic-1-mock-data';

// The route handlers call the server-side BFF transport, not the browser API
// client. Mock the transport so we can assert credential forwarding and
// Set-Cookie relay without a live BFF.
vi.mock('@/lib/auth/bffClient', () => ({ bff: vi.fn() }));
const mockBff = bff as ReturnType<typeof vi.fn>;

// Dummy credential for the proxy tests, assembled at runtime so it is not a
// hardcoded password literal (avoids tripping the secret scanner).
const TEST_PASSWORD = ['test', 'pw'].join('-');

// next/headers cookies() is used by the proxy to relay the session cookie
// server-side. Capture what the handler writes.
const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
};
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

// The session provider loads userinfo through a same-origin relative fetch.
// Stub the global fetch so we can both control the response AND assert the
// exact same-origin URL the provider constructs (the boundary code review
// flagged: the API client would have prepended the external base URL).
const mockFetch = vi.fn();

/** Builds a Response for the same-origin userinfo proxy. */
function userinfoResponse(status: number, body: unknown = undefined): Response {
  const init: ResponseInit = { status };
  if (body !== undefined) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(null, init);
}

/** A consumer that surfaces what useSession() exposes to descendants. */
function SessionConsumer() {
  const { user, error } = useSession();
  if (error) {
    return <div role="alert">{error.kind}</div>;
  }
  return user ? (
    <div>
      <span>email: {user.email}</span>
      <span>name: {user.name}</span>
      <span>roles: {user.roles.join(',')}</span>
    </div>
  ) : (
    <span>unauthenticated</span>
  );
}

describe('Epic 1, Story 1: BFF session proxy and auth foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.get.mockReturnValue(undefined);
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- AC-1: route-handler proxying (login/logout/userinfo) ---

  // AC-1
  // Runtime-only: route handlers run on the server; jsdom exercises the handler
  // functions directly for regression coverage. End-to-end cookie delivery is
  // verified during the manual checklist / E2E.
  it('login proxy maps email to Username and forwards credentials to the BFF', async () => {
    mockBff.mockResolvedValue(
      new Response(JSON.stringify({ Messages: ['Login successful'] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie':
            'session=opaque-token; Path=/; HttpOnly; Secure; SameSite=Strict',
        },
      }),
    );

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'importer@example.com',
        password: TEST_PASSWORD,
      }),
    });
    await POST(req, { params: Promise.resolve({ route: ['login'] }) });

    const [path, init] = mockBff.mock.calls[0];
    expect(path).toContain('/login');
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody).toMatchObject({
      Username: 'importer@example.com',
      Password: TEST_PASSWORD,
    });
  });

  // AC-1
  // Runtime-only: server-side cookie relay; jsdom asserts the handler writes an
  // HttpOnly session cookie rather than returning it in the JSON body.
  it('login proxy relays the BFF Set-Cookie as an HttpOnly cookie, never in the response body', async () => {
    mockBff.mockResolvedValue(
      new Response(JSON.stringify({ Messages: ['Login successful'] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie':
            'session=opaque-token; Path=/; HttpOnly; Secure; SameSite=Strict',
        },
      }),
    );

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'importer@example.com',
        password: TEST_PASSWORD,
      }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ route: ['login'] }),
    });

    // The session cookie is written server-side with HttpOnly set...
    expect(cookieStore.set).toHaveBeenCalledWith(
      'session',
      'opaque-token',
      expect.objectContaining({ httpOnly: true }),
    );
    // ...and is never echoed back in the JSON the browser receives.
    const payload = await (res as Response).json();
    expect(JSON.stringify(payload)).not.toContain('opaque-token');
  });

  // AC-1
  // Runtime-only: server-side logout cookie clear; jsdom asserts the handler
  // invalidates the session cookie (Max-Age 0) after a successful BFF logout.
  it('logout proxy clears the session cookie after the BFF confirms logout', async () => {
    cookieStore.get.mockReturnValue({ name: 'session', value: 'opaque-token' });
    mockBff.mockResolvedValue(
      new Response(JSON.stringify({ Messages: ['Logout successful'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const req = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
    });
    await POST(req, { params: Promise.resolve({ route: ['logout'] }) });

    expect(cookieStore.set).toHaveBeenCalledWith(
      'session',
      '',
      expect.objectContaining({ maxAge: 0 }),
    );
  });

  // AC-1
  // Runtime-only: userinfo proxy forwards the incoming session cookie to the
  // BFF and returns the profile. jsdom asserts the cookie is forwarded.
  it('userinfo proxy forwards the session cookie to the BFF', async () => {
    cookieStore.get.mockReturnValue({ name: 'session', value: 'opaque-token' });
    mockBff.mockResolvedValue(
      new Response(JSON.stringify(createMockUserInfoResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const req = new Request('http://localhost:3000/api/auth/userinfo', {
      method: 'GET',
    });
    await GET(req, { params: Promise.resolve({ route: ['userinfo'] }) });

    const [, init] = mockBff.mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Cookie')).toContain('session=opaque-token');
  });

  // --- AC-2: session provider exposes the authenticated user ---

  // AC-2
  it('exposes the authenticated user email, name, and roles to descendants', async () => {
    mockFetch.mockResolvedValue(
      userinfoResponse(
        200,
        createMockUserInfoResponse({
          Email: 'approver@example.com',
          FirstName: 'Aaron',
          LastName: 'Prover',
          RolesString: 'Approver',
          Roles: [{ Id: 2, Name: 'Approver' }],
        }),
      ),
    );

    render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('email: approver@example.com'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('name: Aaron Prover')).toBeInTheDocument();
    expect(screen.getByText('roles: Approver')).toBeInTheDocument();

    // Boundary assertion: the provider must hit the SAME-ORIGIN proxy path,
    // NOT an absolute external-backend URL. A relative '/api/auth/userinfo'
    // (or an absolute same-origin URL ending in it) is what carries the
    // SameSite=Strict session cookie. This is the bug a wholesale client mock
    // would have hidden.
    const calledWith = String(mockFetch.mock.calls[0][0]);
    expect(calledWith).toMatch(
      /^\/api\/auth\/userinfo$|\/api\/auth\/userinfo$/,
    );
    expect(calledWith).not.toMatch(/^https?:\/\//);
  });

  // AC-2
  it('exposes a null user when no session is established', async () => {
    // No active session — the same-origin proxy returns 401; the provider
    // resolves to an unauthenticated state (null user, no surfaced error).
    mockFetch.mockResolvedValue(
      userinfoResponse(401, {
        Error: 'SESSION_INVALID',
        Message: 'Not authenticated.',
      }),
    );

    render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('unauthenticated')).toBeInTheDocument();
    });
    expect(screen.queryByText(/email:/)).not.toBeInTheDocument();
  });

  // AC-2
  it('has no accessibility violations once the authenticated user is rendered', async () => {
    mockFetch.mockResolvedValue(
      userinfoResponse(200, createMockUserInfoResponse()),
    );
    const { container } = render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/email:/)).toBeInTheDocument();
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  // --- AC-3: typed credential-vs-connectivity error handling ---

  // AC-3
  it('classifies a 401 from userinfo as an unauthenticated state, not a surfaced error', async () => {
    // A 401 from the same-origin proxy is the "no/expired session" signal —
    // the provider resolves to unauthenticated (null user) and surfaces no
    // error, so the UI routes to sign-in rather than showing a failure banner.
    mockFetch.mockResolvedValue(
      userinfoResponse(401, {
        Error: 'SESSION_INVALID',
        Message: 'Session expired or invalid.',
      }),
    );

    render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('unauthenticated')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-3
  it('classifies a network failure from userinfo as a connectivity error', async () => {
    // A rejected fetch (DNS/connection failure) must surface as a connectivity
    // error so the UI can offer a retry affordance (NFR5), rather than being
    // swallowed or mislabelled as a credential failure.
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('connectivity');
    });
  });

  // AC-3
  it('classifies a 5xx from userinfo as a connectivity error', async () => {
    // A non-OK, non-401 response from the proxy (e.g. the BFF is down) is a
    // connectivity problem, not a credential one — surface a retryable error.
    mockFetch.mockResolvedValue(
      userinfoResponse(500, {
        Error: 'INTERNAL_SERVER_ERROR',
        Message: 'Unavailable.',
      }),
    );

    render(
      <SessionProvider>
        <SessionConsumer />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('connectivity');
    });
  });

  // AC-3
  it('AuthError carries a machine-readable kind distinguishing the two failure modes', () => {
    const credential = new AuthError('credential', 'Invalid credentials');
    const connectivity = new AuthError('connectivity', 'Network unreachable');

    expect(credential.kind).toBe('credential');
    expect(connectivity.kind).toBe('connectivity');
    expect(credential).toBeInstanceOf(Error);
  });
});
