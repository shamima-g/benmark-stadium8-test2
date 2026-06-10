/**
 * Transactions API endpoint functions (Epic 2, Story 3).
 *
 * All calls go through the shared API client (CLAUDE.md §3) — never fetch()
 * directly. Per documentation/transactions-api.yaml, GET /v1/transactions
 * exposes NO query parameters (no FileLogId / Status filter — the documented,
 * Gate-2b-approved Epic 2 spec gap). The file-detail summary therefore fetches
 * the full list and filters by FileLogId client-side (see
 * @/lib/files/statusCounts).
 */

import { get } from '@/lib/api/client';
import type { TransactionReadList } from '@/types/api';

/**
 * Fetches the full transactions list (GET /v1/transactions). The endpoint takes
 * no filter params, so callers filter/tally by FileLogId client-side.
 */
export function getTransactions(): Promise<TransactionReadList> {
  return get<TransactionReadList>('/v1/transactions');
}
