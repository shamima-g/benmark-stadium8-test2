/**
 * Epic 1 baseline — shared-surface invariants.
 *
 * Created by Story 1's test-generator because Epic 1 introduces a shared auth
 * surface: the SessionProvider + useSession() hook that every later story in
 * this epic (login page, route guards, nav) consumes. Cross-story invariants
 * live here once, not duplicated in each story's test file.
 *
 * Subsequent stories in Epic 1 cover only their own delta and do NOT redo
 * these checks.
 *
 * Transport note: SessionProvider loads userinfo via a same-origin relative
 * `fetch('/api/auth/userinfo')` (NOT the shared API client, which would
 * prepend the external backend base URL and resolve cross-origin, dropping the
 * SameSite=Strict session cookie). The baseline stubs the global `fetch`
 * accordingly.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Shared auth surface.
import { SessionProvider, useSession } from '@/components/auth/SessionProvider';
import { createMockUserInfoResponse } from '../helpers/epic-1-mock-data';

const mockFetch = vi.fn();

function CurrentUserProbe() {
  const { user } = useSession();
  return <span>{user ? user.email : 'anonymous'}</span>;
}

describe('Epic 1 baseline: shared session surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Cross-story invariant: useSession() is only valid inside the provider.
  // Every later story renders its UI under SessionProvider; a stray consumer
  // must fail loudly rather than read an undefined context.
  it('throws when useSession is used outside SessionProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<CurrentUserProbe />)).toThrow();
    spy.mockRestore();
  });

  // Cross-story invariant: the provider is the single source of authenticated
  // identity for the epic. Descendants read the authenticated user from it.
  it('provides the authenticated user to descendants via useSession', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(createMockUserInfoResponse()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    render(
      <SessionProvider>
        <CurrentUserProbe />
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('importer@example.com')).toBeInTheDocument();
    });
  });
});
