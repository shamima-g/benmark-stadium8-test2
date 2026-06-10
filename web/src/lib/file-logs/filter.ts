/**
 * Client-side filter predicate for the File Logs dashboard (Epic 2, Story 1).
 *
 * R8 / project-brief §13 spec-gap: GET /v1/file-logs exposes no filter query
 * params, so the dashboard derives Status / File Name / Process-Date-range
 * filtering client-side over the full active list. This module is the pure
 * predicate; the page owns the filter state and active-chip UI.
 *
 * Criteria compose with AND. An empty filter set is a no-op (returns the full
 * list). Matching rules:
 *   - status:          exact match on the row status (case-insensitive).
 *   - fileName:        case-insensitive substring match on the file name.
 *   - processDateFrom/processDateTo: inclusive YYYY-MM-DD bounds compared on the
 *     row's process-date calendar day (the time component is ignored).
 */

import type { FileLogRow } from './mapping';

/** The set of active File Logs filters. Any subset may be supplied. */
export interface FileLogFilters {
  /** Exact status match (case-insensitive), e.g. "Failed". */
  status?: string;
  /** Case-insensitive substring match on the file name. */
  fileName?: string;
  /** Inclusive lower bound on the process date, as YYYY-MM-DD. */
  processDateFrom?: string;
  /** Inclusive upper bound on the process date, as YYYY-MM-DD. */
  processDateTo?: string;
}

/** The YYYY-MM-DD calendar-day portion of an ISO-ish date string. */
function dayOf(dateString: string): string {
  return dateString.slice(0, 10);
}

/** Whether a (possibly empty) string filter value is meaningfully set. */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Returns the rows matching every supplied filter criterion. Unsupplied (or
 * blank) criteria are ignored; with no criteria the full list is returned
 * unchanged. Non-mutating — a new array is always returned.
 */
export function filterFileLogRows(
  rows: FileLogRow[],
  filters: FileLogFilters,
): FileLogRow[] {
  const status = isSet(filters.status)
    ? filters.status.trim().toLowerCase()
    : undefined;
  const fileName = isSet(filters.fileName)
    ? filters.fileName.trim().toLowerCase()
    : undefined;
  const from = isSet(filters.processDateFrom)
    ? filters.processDateFrom
    : undefined;
  const to = isSet(filters.processDateTo) ? filters.processDateTo : undefined;

  return rows.filter((row) => {
    if (status !== undefined && row.status.toLowerCase() !== status) {
      return false;
    }
    if (
      fileName !== undefined &&
      !row.fileName.toLowerCase().includes(fileName)
    ) {
      return false;
    }
    if (from !== undefined || to !== undefined) {
      const day = dayOf(row.processDate);
      if (from !== undefined && day < from) {
        return false;
      }
      if (to !== undefined && day > to) {
        return false;
      }
    }
    return true;
  });
}
