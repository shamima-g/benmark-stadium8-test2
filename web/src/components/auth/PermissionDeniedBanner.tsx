import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * In-page permission-denied banner (project-brief §2).
 *
 * When a signed-in user reaches a protected route their role does not grant,
 * the application surfaces this in-page banner naming the missing permission —
 * deliberately NOT a generic 403 error page and NOT a bounce to login (the user
 * is authenticated; they simply lack access to this surface). Composed from the
 * Shadcn Alert primitive (CLAUDE.md §2), which carries role="alert" so the
 * denial is announced to assistive technology (NFR1).
 */
export function PermissionDeniedBanner({ pageName }: { pageName: string }) {
  return (
    <Alert variant="destructive" className="mx-auto mt-8 max-w-2xl">
      <AlertTitle>You don&apos;t have permission to view this page</AlertTitle>
      <AlertDescription>
        Your role does not include access to the {pageName} page. If you need
        access, contact your administrator.
      </AlertDescription>
    </Alert>
  );
}
