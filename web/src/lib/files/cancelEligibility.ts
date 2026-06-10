/**
 * Cancel-eligibility predicate (Epic 2, Story 4; BR7).
 *
 * A file may NOT be cancelled once any of its transactions has been Approved.
 * GET /v1/transactions exposes no FileLogId / Status filter (the documented
 * Epic 2 spec gap, reused from Story 3), so eligibility is derived client-side
 * over the full transactions list: scoped strictly to the file under test, an
 * Approved transaction owned by a DIFFERENT file must never block this one.
 */

import type { TransactionRead } from '@/types/api';

/**
 * True when the file may be cancelled: false iff ANY transaction whose
 * FileLogId matches `fileLogId` has Status 'Approved' (case-insensitive).
 * Transactions belonging to other files are ignored (BR7).
 */
export function canCancelFile(
  transactions: TransactionRead[],
  fileLogId: number,
): boolean {
  if (!Array.isArray(transactions)) {
    return true;
  }
  return !transactions.some(
    (transaction) =>
      transaction.FileLogId === fileLogId &&
      transaction.Status.trim().toLowerCase() === 'approved',
  );
}
