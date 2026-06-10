/**
 * Row-action gating for the Transactions table (Epic 4; R9 / BR1 / BR9).
 *
 * canActionTransaction decides VISIBILITY of the row-level approval actions
 * (Approve in Story 1; Reject in Story 2) — they are Approver-only (BR9:
 * Importers see the table read-only with NO action controls; §2: denied actions
 * are HIDDEN, not rendered disabled, so an Importer sees no action control at
 * all). Mirrors the established role-predicate convention in
 * @/lib/transactions/exportGating.canExportTransactions (case-insensitive
 * role-name match, null-safe — a missing/empty role set is never granted).
 *
 * This predicate gates only whether a role MAY act; whether a given row is in an
 * actionable state (e.g. only an Imported row can be approved) is decided at the
 * row level by its Status, not here.
 */

/** True only when the role set includes 'Approver' (case-insensitive, null-safe). */
export function canActionTransaction(roles: string[]): boolean {
  if (!Array.isArray(roles)) {
    return false;
  }
  return roles.some((role) => role.trim().toLowerCase() === 'approver');
}
