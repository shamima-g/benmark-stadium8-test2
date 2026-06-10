/**
 * File-lifecycle control gating (Epic 2, Story 4; BR10).
 *
 * Retry Validation, Cancel File, and the validation-error retry affordances are
 * Importer-only: an Approver viewing the same file is never granted them. The
 * page is accessible to BOTH roles (Story 3 grants /files to both) — this gate
 * is about the CONTROLS, not page access.
 *
 * The predicate keys off the role set (the test's pinned contract). It stays
 * consistent with the established granted-routes access model: routing decides
 * who may VIEW the file detail (both roles), while this role-based predicate
 * decides who may MUTATE it (Importer only).
 */

/** True only when the role set includes 'Importer' (case-insensitive). */
export function canUseFileLifecycleControls(roles: string[]): boolean {
  if (!Array.isArray(roles)) {
    return false;
  }
  return roles.some((role) => role.trim().toLowerCase() === 'importer');
}
