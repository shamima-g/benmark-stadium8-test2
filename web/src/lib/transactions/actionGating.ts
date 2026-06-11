/**
 * Row-action gating for the Transactions table (Epic 4; R9 / R10 / BR1 / BR9).
 *
 * Two complementary halves gate whether a transaction may be actioned:
 *   - canActionTransaction — the ROLE half: whether the signed-in role MAY act
 *     (Approver-only). Drives VISIBILITY of the row-level approval actions
 *     (Approve in Story 1; Reject in Story 2) — Importers see the table read-only
 *     with NO action controls (BR9; §2: denied actions are HIDDEN, not disabled).
 *   - isActionableTransactionStatus — the STATE half (Story 3 / BR1): whether the
 *     row is in the single actionable state. Only an 'Imported' transaction can be
 *     approved or rejected; both terminal states ('Approved', 'Rejected') — and any
 *     unknown/empty/mis-cased/missing status — are NON-actionable. A row may be
 *     actioned only when the role MAY act AND the row IS actionable.
 *
 * ACTIONABLE_STATUS is the single source of truth for the actionable state. The
 * page imports it (rather than redefining its own literal) so the predicate, the
 * row-actions cell (BR1 / AC-1), the terminal-state banner (AC-2), and the
 * confirm-time concurrent-change guard (AC-4) all agree on one definition.
 *
 * canActionTransaction mirrors the established role-predicate convention in
 * @/lib/transactions/exportGating.canExportTransactions (case-insensitive role-name
 * match, null-safe — a missing/empty role set is never granted).
 */

/** The single Transaction Status eligible for the Approve / Reject actions (BR1). */
export const ACTIONABLE_STATUS = 'Imported';

/** True only when the role set includes 'Approver' (case-insensitive, null-safe). */
export function canActionTransaction(roles: string[]): boolean {
  if (!Array.isArray(roles)) {
    return false;
  }
  return roles.some((role) => role.trim().toLowerCase() === 'approver');
}

/**
 * The STATE half of the action gate (BR1). True ONLY when the row's Status is the
 * actionable 'Imported' state; false for the terminal 'Approved' / 'Rejected'
 * states and for any unknown / empty / mis-cased / missing status (fail closed —
 * a row whose state we cannot read as exactly actionable is never re-actioned).
 * Case-sensitive against the canonical §11 vocabulary. Null-safe.
 */
export function isActionableTransactionStatus(
  status: string | null | undefined,
): boolean {
  return status === ACTIONABLE_STATUS;
}
