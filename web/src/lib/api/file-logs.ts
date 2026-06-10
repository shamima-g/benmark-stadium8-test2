/**
 * File Logs API endpoint functions (Epic 2, Story 1).
 *
 * All calls go through the shared API client (CLAUDE.md §3) — never fetch()
 * directly. GET /v1/file-logs requires the IsActive query param (string "Yes"),
 * per documentation/transactions-api.yaml.
 */

import { get } from '@/lib/api/client';
import type { FileLogList } from '@/types/api';

/**
 * Fetches the active File Logs list (GET /v1/file-logs?IsActive=Yes). The
 * dashboard derives all filtering/sorting/pagination client-side from this list
 * (R8 spec-gap: the endpoint exposes no filter params).
 */
export function getActiveFileLogs(): Promise<FileLogList> {
  return get<FileLogList>('/v1/file-logs', { IsActive: 'Yes' });
}
