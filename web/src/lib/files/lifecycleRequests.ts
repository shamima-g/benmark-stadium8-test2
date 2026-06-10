/**
 * File-lifecycle request builders (Epic 2, Story 4; R13 / R14).
 *
 * Both mutations go through the shared API client (CLAUDE.md §3) — never fetch()
 * directly. Per documentation/transactions-api.yaml:
 *   - POST /v1/files/retry-validation carries the file's LogId as a QUERY param
 *     and returns a DefaultResponse (R13). The caller reflects the updated File
 *     Status from a subsequent file-logs re-read.
 *   - DELETE /v1/files carries the LogId as a QUERY param and the acting user in
 *     a REQUIRED LastChangedUser HEADER (R14 / BR7). The client's del() exposes
 *     no `params` option, so the LogId query string is baked into the endpoint
 *     and the user is passed as the 2nd del() argument (mapped to the
 *     LastChangedUser header).
 */

import { del, post } from '@/lib/api/client';
import type { DefaultResponse } from '@/types/api';

/**
 * Retries validation for a Failed file (R13). POSTs to
 * /v1/files/retry-validation?LogId=<id>; on success the caller re-reads the
 * file-logs list to reflect the updated File Status.
 */
export function retryFileValidation(logId: number): Promise<DefaultResponse> {
  return post<DefaultResponse>(
    `/v1/files/retry-validation?LogId=${logId}`,
    undefined,
    undefined,
    { requiresAuth: true },
  );
}

/**
 * Cancels (deactivates + deletes) a file (R14). Issues DELETE
 * /v1/files?LogId=<id> carrying the acting user in the LastChangedUser audit
 * header. The LogId is baked into the endpoint because del() takes no params.
 */
export function cancelFile(
  logId: number,
  lastChangedUser: string,
): Promise<DefaultResponse> {
  return del<DefaultResponse>(`/v1/files?LogId=${logId}`, lastChangedUser, {
    requiresAuth: true,
  });
}
