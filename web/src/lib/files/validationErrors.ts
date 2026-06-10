/**
 * Validation-errors parsing + column-resolution helpers (Epic 2, Story 4; R15).
 *
 * The validation-errors grid is built from two endpoints whose responses carry
 * a documented quirk:
 *   - GET /v1/files/validation-errors returns a ValidationErrors object whose
 *     `JsonArray` field is a JSON-array STRING (NOT a parsed array), so the page
 *     must JSON.parse it into row objects before rendering. The error-row keys
 *     vary by table (the dynamic-columns spec gap), so each row is modelled as a
 *     plain Record.
 *   - GET /v1/files/validation-errors/columns returns ColumnList — the grid
 *     columns are built DYNAMICALLY from this metadata in declared order, with
 *     Visible:false columns dropped from the rendered grid.
 *
 * Both helpers are pure and total: a malformed / empty JsonArray degrades to an
 * empty row set (never throws — the backend is unreliable per §13/NFR8) so the
 * view can render an empty/error state rather than crash the page.
 */

import type { ColumnDefinition } from '@/types/api';

/** One parsed validation-error row. Keys vary by table (dynamic-columns gap). */
export type ValidationErrorRow = Record<string, unknown>;

/**
 * JSON.parses the ValidationErrors.JsonArray STRING into row objects. Returns an
 * empty array for empty / malformed / non-array input — never throws.
 */
export function parseValidationErrors(
  jsonArrayString: string,
): ValidationErrorRow[] {
  if (typeof jsonArrayString !== 'string' || jsonArrayString.trim() === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(jsonArrayString);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (row): row is ValidationErrorRow =>
        typeof row === 'object' && row !== null && !Array.isArray(row),
    );
  } catch {
    return [];
  }
}

/**
 * Resolves the visible grid columns from the ColumnList, in declared order,
 * dropping any column flagged Visible:false.
 */
export function resolveValidationColumns(
  columnList: ColumnDefinition[],
): ColumnDefinition[] {
  if (!Array.isArray(columnList)) {
    return [];
  }
  return columnList.filter((column) => column.Visible);
}
