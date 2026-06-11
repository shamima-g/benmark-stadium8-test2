/**
 * Transactions API endpoint functions (Epic 2, Story 3; Epic 4, Stories 1 & 2).
 *
 * All calls go through the shared API client (CLAUDE.md §3) — never fetch()
 * directly. Per documentation/transactions-api.yaml, GET /v1/transactions
 * exposes NO query parameters (no FileLogId / Status filter — the documented,
 * Gate-2b-approved Epic 2 spec gap). The file-detail summary therefore fetches
 * the full list and filters by FileLogId client-side (see
 * @/lib/files/statusCounts).
 */

import { get, post } from '@/lib/api/client';
import type { DefaultResponse, TransactionReadList } from '@/types/api';

/**
 * Fetches the full transactions list (GET /v1/transactions). The endpoint takes
 * no filter params, so callers filter/tally by FileLogId client-side.
 */
export function getTransactions(): Promise<TransactionReadList> {
  return get<TransactionReadList>('/v1/transactions');
}

/**
 * Approves an Imported transaction (Epic 4, Story 1; R9 / BR1). POSTs to
 * /v1/transactions/approve?TransactionId=<id>; the backend sets that
 * transaction's Status to 'Approved'. Per documentation/transactions-api.yaml
 * the TransactionId is a REQUIRED query param and LastChangedUser a REQUIRED
 * header. The client's post() exposes no params option for this contract, so the
 * TransactionId is baked into the endpoint string and the acting user is passed
 * as the 3rd argument (mapped to the LastChangedUser audit header) — mirroring
 * the Epic-2 Story-4 cancelFile convention in @/lib/files/lifecycleRequests.
 */
export function approveTransaction(
  transactionId: number,
  lastChangedUser: string,
): Promise<DefaultResponse> {
  return post<DefaultResponse>(
    `/v1/transactions/approve?TransactionId=${transactionId}`,
    undefined,
    lastChangedUser,
    { requiresAuth: true },
  );
}

/**
 * Rejects an Imported transaction with a mandatory note (Epic 4, Story 2;
 * R10 / BR2). POSTs to /v1/transactions/reject?TransactionId=<id> with the body
 * { UserNote } (TransactionRejectWrite); the backend sets that transaction's
 * Status to 'Rejected' and records the supplied note. Per
 * documentation/transactions-api.yaml the TransactionId is a REQUIRED query
 * param and LastChangedUser a REQUIRED header. As with approveTransaction, the
 * client's post() exposes no params option for this contract, so the
 * TransactionId is baked into the endpoint string, the note travels in the body,
 * and the acting user is passed as the 3rd argument (mapped to the
 * LastChangedUser audit header).
 */
export function rejectTransaction(
  transactionId: number,
  userNote: string,
  lastChangedUser: string,
): Promise<DefaultResponse> {
  return post<DefaultResponse>(
    `/v1/transactions/reject?TransactionId=${transactionId}`,
    { UserNote: userNote },
    lastChangedUser,
    { requiresAuth: true },
  );
}
