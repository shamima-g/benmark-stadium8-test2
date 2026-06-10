/**
 * Validation-errors API endpoint functions (Epic 2, Story 4; R15).
 *
 * All calls go through the shared API client (CLAUDE.md §3) — never fetch()
 * directly. Per documentation/transactions-api.yaml both endpoints require the
 * FileLogId query param:
 *   - GET /v1/files/validation-errors          -> ValidationErrors (JsonArray is
 *     a JSON-array STRING the caller must JSON.parse).
 *   - GET /v1/files/validation-errors/columns  -> ColumnList (the dynamic grid
 *     column metadata).
 */

import { get } from '@/lib/api/client';
import type { ColumnList, ValidationErrors } from '@/types/api';

/**
 * Fetches the invalid rows for a file (GET /v1/files/validation-errors?FileLogId=).
 * The response's JsonArray field is a STRING — callers JSON.parse it.
 */
export function getValidationErrors(
  fileLogId: number,
): Promise<ValidationErrors> {
  return get<ValidationErrors>(
    '/v1/files/validation-errors',
    { FileLogId: fileLogId },
    { requiresAuth: true },
  );
}

/**
 * Fetches the validation-errors grid column metadata
 * (GET /v1/files/validation-errors/columns?FileLogId=).
 */
export function getValidationErrorColumns(
  fileLogId: number,
): Promise<ColumnList> {
  return get<ColumnList>(
    '/v1/files/validation-errors/columns',
    { FileLogId: fileLogId },
    { requiresAuth: true },
  );
}
