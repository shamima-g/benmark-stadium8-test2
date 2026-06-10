/**
 * Export control gating for the Transactions table (Epic 3, Story 3; R11 / BR6 /
 * BR9).
 *
 * Two pure predicates the page wires the Export affordance off:
 *   - canExportTransactions decides VISIBILITY — Export is Approver-only (BR9:
 *     Importers see the table read-only with no action controls; §2: denied
 *     actions are HIDDEN, not disabled). Mirrors the established role-predicate
 *     convention in @/lib/files/lifecycleGating (case-insensitive role-name
 *     match, null-safe — a missing/empty role set is never granted).
 *   - canExportNow decides the DISABLED state — Export is enabled only when the
 *     currently-filtered set has at least one row (BR6: Export is disabled with
 *     an explanation when zero rows match the active filter).
 */

/** True only when the role set includes 'Approver' (case-insensitive, null-safe). */
export function canExportTransactions(roles: string[]): boolean {
  if (!Array.isArray(roles)) {
    return false;
  }
  return roles.some((role) => role.trim().toLowerCase() === 'approver');
}

/** True when at least one row matches the active filter (BR6); false at zero. */
export function canExportNow(filteredRowCount: number): boolean {
  return filteredRowCount > 0;
}
