/**
 * Upload route-access predicate (Epic 2, Story 2 — AC-4 / BR10 / §2).
 *
 * File Upload is Importer-only. Rather than key off role NAMES (brittle per the
 * §13 caveat that live role names may differ from the spec), access is decided
 * from the user's granted route set (AuthUser.routes, derived from PageRead.Route
 * in the BFF userinfo payload) — exactly the signal the `(app)` layout gate uses.
 * An Importer's granted routes include /upload; an Approver's do not; a
 * null/unknown user is never granted.
 */

import type { AuthUser } from '@/types/auth';
import { UPLOAD_ROUTE } from '@/lib/auth/routes';

/** True iff the user's granted routes include the Upload surface. */
export function canAccessUpload(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return (user.routes ?? []).includes(UPLOAD_ROUTE);
}
