'use client';

/**
 * Login screen (/login) — Epic 1, Story 2.
 *
 * Email + password sign-in form composed from Shadcn primitives (Card, Input,
 * Label, Button). Submits through the SAME-ORIGIN BFF proxy POST /api/auth/login
 * (built in Story 1) via a relative-path `fetch` — NOT the shared API client.
 * The shared client prepends the external backend base URL and would resolve
 * cross-origin, dropping the SameSite=Strict HttpOnly session cookie. The
 * documented BFF exception (bff-auth-pattern.md) is that same-origin proxy
 * routes must be hit with a relative `fetch`.
 *
 * Error states (R2 / NFR5) are distinguished:
 *   - credential failure (proxy 401)  -> inline, generic credential message
 *     (never names which field was wrong, per auth-api.yaml), NO retry control.
 *   - connectivity failure (network throw, or any non-401 non-OK such as 5xx)
 *     -> a DISTINCT inline connectivity message WITH a retry control.
 * Both are rendered in a single role="alert" live region.
 *
 * Session-ended explanation (Story 5 / NFR5, NFR6): when the user arrives here
 * from a session timeout, SessionTimeout records the reason in sessionStorage
 * (SESSION_ENDED_STORAGE_KEY) before handing off to /login. This page reads and
 * clears that signal on mount and surfaces a clear, accessible "your session
 * ended" notice so the return to login is explained rather than looking like a
 * fresh, unexplained sign-out. The signal is carried via sessionStorage (not a
 * URL query param) so the hand-off route stays exactly `/login`, matching the
 * single, unadorned login route the route-protection gate and sign-out flow
 * share. The notice never interferes with the form's credential/connectivity
 * error states.
 *
 * POPIA (project-brief §5): the privacy-policy link is shown on this
 * data-collection form.
 *
 * Field-level validation (NFR1): errors set aria-invalid and are linked to
 * their input via aria-describedby; the form is fully keyboard-operable
 * (native form submit on Enter, native tab order).
 *
 * Role-based landing (Story 3): on success the form refreshes the session so the
 * SessionProvider picks up the newly-issued profile, then hands off to the
 * protected (app) root '/', which resolves the role-specific landing (Importer
 * -> Dashboard, Approver -> Transactions) and redirects there. The form does not
 * encode the role mapping itself.
 */

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOptionalSession } from '@/components/auth/SessionProvider';
import { loginSchema } from '@/lib/validation/schemas';
import {
  SESSION_ENDED_STORAGE_KEY,
  SESSION_ENDED_TIMEOUT,
} from '@/lib/auth/session-timing';

/** Same-origin BFF proxy endpoint. Relative path keeps the session cookie. */
const LOGIN_PROXY_PATH = '/api/auth/login';

/**
 * Where to hand off after a successful sign-in. The protected (app) root ('/')
 * resolves the role-specific landing (Importer -> Dashboard, Approver ->
 * Transactions) and redirects there (Story 3); the login form does not encode
 * the role mapping itself.
 */
const POST_LOGIN_ROUTE = '/';

const SESSION_ENDED_MESSAGE =
  'Your session ended due to inactivity. Please sign in again to continue.';

/** Per-field validation messages keyed by field name. */
type FieldErrors = { email?: string; password?: string };

/**
 * A submit-time failure. `credential` is non-retryable (bad email/password);
 * `connectivity` is retryable (network failure or 5xx).
 */
type SubmitError = { kind: 'credential' | 'connectivity'; message: string };

const CREDENTIAL_ERROR_MESSAGE = 'Invalid email or password.';
const CONNECTIVITY_ERROR_MESSAGE =
  'We could not reach the sign-in service. Please check your connection and try again.';

/**
 * Reads and clears the session-timeout signal SessionTimeout left in
 * sessionStorage. Returns true exactly once per timeout hand-off, so the notice
 * does not persist across a manual reload after the user has seen it.
 */
function consumeSessionEndedSignal(): boolean {
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    const reason = window.sessionStorage.getItem(SESSION_ENDED_STORAGE_KEY);
    if (reason === SESSION_ENDED_TIMEOUT) {
      window.sessionStorage.removeItem(SESSION_ENDED_STORAGE_KEY);
      return true;
    }
    return false;
  } catch {
    // sessionStorage unavailable (private mode / disabled) — no notice to show.
    return false;
  }
}

export default function LoginPage() {
  const router = useRouter();
  // Opportunistic: when rendered under the app's SessionProvider (the real app)
  // this lets a successful sign-in refresh the session so the provider sees the
  // new profile before we hand off to the role-aware landing. Returns null when
  // rendered without a provider (some isolated test contexts), in which case the
  // handoff still happens via the router.
  const session = useOptionalSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // True when the user arrived here because their session timed out (Story 5).
  const [sessionEnded, setSessionEnded] = useState(false);

  // Read + clear the timeout signal on mount (client-only). Done in an effect so
  // it runs after hydration and touches sessionStorage only in the browser.
  useEffect(() => {
    if (consumeSessionEndedSignal()) {
      setSessionEnded(true);
    }
  }, []);

  // Stable ids so labels/inputs/error nodes are programmatically linked.
  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();

  /**
   * Sends the credentials to the same-origin proxy and classifies the outcome.
   * Returns null on success, or a typed SubmitError to surface.
   */
  async function attemptLogin(credentials: {
    email: string;
    password: string;
  }): Promise<SubmitError | null> {
    let response: Response;
    try {
      response = await fetch(LOGIN_PROXY_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials),
      });
    } catch {
      // Connection refused / DNS / network abort — a connectivity failure.
      return { kind: 'connectivity', message: CONNECTIVITY_ERROR_MESSAGE };
    }

    if (response.ok) {
      return null;
    }

    // A 401 is a credential failure; anything else non-OK (5xx, etc.) is a
    // connectivity/service failure that the user can retry (NFR5). We do NOT
    // surface the proxy's body message for credentials — the form owns a
    // generic message so no specific field is ever revealed.
    if (response.status === 401) {
      return { kind: 'credential', message: CREDENTIAL_ERROR_MESSAGE };
    }
    return { kind: 'connectivity', message: CONNECTIVITY_ERROR_MESSAGE };
  }

  /** Validates, submits, and routes/handles errors. */
  async function runSubmit() {
    setSubmitError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === 'email' && !nextErrors.email) {
          nextErrors.email = issue.message;
        }
        if (field === 'password' && !nextErrors.password) {
          nextErrors.password = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const error = await attemptLogin(result.data);
      if (error) {
        setSubmitError(error);
        return;
      }
      // A successful sign-in supersedes any prior session-ended notice.
      setSessionEnded(false);
      // Success: the proxy set the HttpOnly session cookie server-side. Refresh
      // the session so the SessionProvider loads the new profile (which the
      // (app) root needs to resolve the role-specific landing), then hand off to
      // the protected root, which redirects to that landing.
      if (session) {
        await session.refresh();
      }
      router.push(POST_LOGIN_ROUTE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSubmit();
  }

  function handleRetry() {
    void runSubmit();
  }

  const describedByEmail = fieldErrors.email ? emailErrorId : undefined;
  const describedByPassword = fieldErrors.password
    ? passwordErrorId
    : undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your credentials to access the Transaction Import &amp;
            Approval System.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form noValidate onSubmit={handleFormSubmit} className="space-y-6">
            {sessionEnded && !submitError && (
              <div
                role="status"
                className="rounded-md border border-primary/40 bg-accent px-4 py-3 text-sm text-foreground"
              >
                <p>{SESSION_ENDED_MESSAGE}</p>
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <p>{submitError.message}</p>
                {submitError.kind === 'connectivity' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleRetry}
                    disabled={isSubmitting}
                  >
                    Try again
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={emailId}>Email</Label>
              <Input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={describedByEmail}
              />
              {fieldErrors.email && (
                <p id={emailErrorId} className="text-sm text-destructive">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={passwordId}>Password</Label>
              <Input
                id={passwordId}
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={describedByPassword}
              />
              {fieldErrors.password && (
                <p id={passwordErrorId} className="text-sm text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            By signing in you agree to our{' '}
            <Link
              href="/privacy-policy"
              className="text-primary underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
