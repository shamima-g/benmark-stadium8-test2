/**
 * File-detail status-count helpers (Epic 2, Story 3; R12 / BR4).
 *
 * Pure, side-effect-free functions extracted so the count / drill-through-href /
 * work-in-progress logic can be asserted in isolation (Vitest) and reused by the
 * file-detail page. They underpin the page's status-count summary (R12), the
 * count drill-through link target (R12 + R7), and the BR4 work-in-progress
 * banner predicate.
 *
 * Per the Epic 2 spec gap (epic overview): GET /v1/transactions exposes no
 * FileLogId / Status query params, so the page fetches the full transactions
 * list and computeStatusCounts() filters by FileLogId + tallies the status
 * counts client-side.
 */

import type { TransactionRead } from '@/types/api';

/** The per-file status summary: a Total plus the three per-status sub-tallies. */
export interface StatusCounts {
  total: number;
  imported: number;
  approved: number;
  rejected: number;
}

/** The drillable per-status counts (Total is a static figure, not a link). */
export type DrillableStatus = 'Imported' | 'Approved' | 'Rejected';

/**
 * Tallies Total / Imported / Approved / Rejected for ONLY the transactions that
 * belong to the given FileLogId. The transactions list is the full GET
 * /v1/transactions response (the endpoint cannot filter server-side), so the
 * FileLogId filter happens here. Total is the count of matching transactions;
 * the per-status sub-tallies are keyed case-insensitively so a backend casing
 * drift never silently drops a transaction from its bucket. A file with no
 * matching transactions yields an all-zero summary (no crash, no NaN).
 */
export function computeStatusCounts(
  transactions: TransactionRead[],
  fileLogId: number,
): StatusCounts {
  const counts: StatusCounts = {
    total: 0,
    imported: 0,
    approved: 0,
    rejected: 0,
  };

  for (const transaction of transactions) {
    if (transaction.FileLogId !== fileLogId) {
      continue;
    }
    counts.total += 1;
    switch (transaction.Status.trim().toLowerCase()) {
      case 'imported':
        counts.imported += 1;
        break;
      case 'approved':
        counts.approved += 1;
        break;
      case 'rejected':
        counts.rejected += 1;
        break;
      default:
        // Counted toward Total, but not a recognised drillable bucket.
        break;
    }
  }

  return counts;
}

/**
 * Builds the drill-through link target for a status count: the Transactions
 * route pre-filtered by this file + status (R12 + R7). The Transactions screen
 * is a later epic — this only produces the agreed query-param URL the count
 * links to.
 */
export function buildTransactionsHref(
  fileLogId: number,
  status: DrillableStatus,
): string {
  return `/transactions?fileLogId=${fileLogId}&status=${status}`;
}

/** The set of File-Log statuses BR4 treats as work-in-progress (not yet final). */
const WORK_IN_PROGRESS_STATUSES = new Set(['processing', 'uploaded']);

/**
 * BR4 predicate: true when a File Log's status means its dataset is not yet
 * final (Processing or Uploaded). Keyed case-insensitively so a backend casing
 * drift never silently flips the work-in-progress banner off.
 */
export function isFileWorkInProgress(status: string): boolean {
  return WORK_IN_PROGRESS_STATUSES.has(status.trim().toLowerCase());
}
