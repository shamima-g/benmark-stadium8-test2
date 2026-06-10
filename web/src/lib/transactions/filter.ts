/**
 * Client-side filter predicate for the Transactions table (Epic 3, Story 2).
 *
 * R7 / project-brief §7 spec-gap: GET /v1/transactions exposes no filter query
 * params (the documented, Gate-2b-approved Epic 2 spec gap), so the Transactions
 * screen derives Status / File (FileLogId) / Transaction-Date-range / Amount-range
 * / free-text filtering client-side over the full list. This module is the pure
 * predicate; the page owns the filter state and active-chip UI.
 *
 * Mirrors @/lib/file-logs/filter conventions exactly: criteria compose with AND,
 * an empty/blank/undefined criterion is a no-op, and the function is non-mutating
 * (a new array is always returned). Matching rules (R7):
 *   - status:          exact match on the row status (case-insensitive).
 *   - fileLogId:       exact match on the row's owning FileLogId (by id).
 *   - dateFrom/dateTo: inclusive YYYY-MM-DD bounds compared on the transaction's
 *     calendar day (the time component is ignored).
 *   - amountMin/amountMax: inclusive NUMERIC bounds on the transaction amount.
 *   - search:          case-insensitive SUBSTRING match on Reference OR
 *     AccountNumber (the OR spans both fields).
 */

import type { TransactionRow } from './mapping';

/** The set of active Transactions filters. Any subset may be supplied. */
export interface TransactionFilters {
  /** Exact status match (case-insensitive), e.g. "Approved". */
  status?: string;
  /** Exact match on the owning file's FileLogId. */
  fileLogId?: number;
  /** Inclusive lower bound on the transaction date, as YYYY-MM-DD. */
  dateFrom?: string;
  /** Inclusive upper bound on the transaction date, as YYYY-MM-DD. */
  dateTo?: string;
  /** Inclusive lower bound on the transaction amount (numeric). */
  amountMin?: number;
  /** Inclusive upper bound on the transaction amount (numeric). */
  amountMax?: number;
  /** Case-insensitive substring match on Reference OR Account Number. */
  search?: string;
}

/** The YYYY-MM-DD calendar-day portion of an ISO-ish date string. */
function dayOf(dateString: string): string {
  return dateString.slice(0, 10);
}

/** Whether a (possibly empty) string filter value is meaningfully set. */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/** Whether a numeric filter bound is meaningfully set (a real, finite number). */
function isNumberSet(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/**
 * Returns the rows matching every supplied filter criterion. Unsupplied (or
 * blank) criteria are ignored; with no criteria the full list is returned
 * unchanged. Non-mutating — a new array is always returned.
 */
export function filterTransactionRows(
  rows: TransactionRow[],
  filters: TransactionFilters,
): TransactionRow[] {
  const status = isSet(filters.status)
    ? filters.status.trim().toLowerCase()
    : undefined;
  const fileLogId = filters.fileLogId;
  const from = isSet(filters.dateFrom) ? filters.dateFrom : undefined;
  const to = isSet(filters.dateTo) ? filters.dateTo : undefined;
  const amountMin = isNumberSet(filters.amountMin)
    ? filters.amountMin
    : undefined;
  const amountMax = isNumberSet(filters.amountMax)
    ? filters.amountMax
    : undefined;
  const search = isSet(filters.search)
    ? filters.search.trim().toLowerCase()
    : undefined;

  return rows.filter((row) => {
    if (status !== undefined && row.status.toLowerCase() !== status) {
      return false;
    }
    if (fileLogId !== undefined && row.fileLogId !== fileLogId) {
      return false;
    }
    if (from !== undefined || to !== undefined) {
      const day = dayOf(row.transactionDate);
      if (from !== undefined && day < from) {
        return false;
      }
      if (to !== undefined && day > to) {
        return false;
      }
    }
    if (amountMin !== undefined && row.amount < amountMin) {
      return false;
    }
    if (amountMax !== undefined && row.amount > amountMax) {
      return false;
    }
    if (search !== undefined) {
      const haystack = `${row.reference} ${row.account}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}
