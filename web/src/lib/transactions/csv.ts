/**
 * Client-side CSV serialisation for the Transactions export (Epic 3, Story 3;
 * R11 / BR6).
 *
 * Pure, deterministic, side-effect-free builders so the serialised string and
 * the suggested filename can be asserted in isolation (Vitest) and reused by the
 * page. The page owns the filtered row set and the browser-download mechanism;
 * these helpers only turn data into text.
 *
 *   - buildTransactionsCsv serialises EXACTLY the supplied rows (BR6 — the page
 *     hands it the currently-filtered set), in the supplied order (no re-sort),
 *     with a header row carrying the brief's R6 columns in their documented order
 *     (Reference, Transaction Date, Account, Description, Amount, Currency,
 *     Transaction Type, Status). Values are RFC4180-escaped and lines CRLF-joined.
 *   - buildTransactionsCsvFilename produces a filename that reflects the active
 *     filters and the date. The date is an INJECTED parameter (never new Date()
 *     internally) so the output is deterministic and unit-testable.
 */

import type { TransactionRow } from './mapping';
import type { TransactionFilters } from './filter';

/**
 * The export header row — the brief's R6 columns in their documented order. Each
 * supplied row serialises its values onto a line in this exact column order.
 */
const CSV_HEADERS = [
  'Reference',
  'Transaction Date',
  'Account',
  'Description',
  'Amount',
  'Currency',
  'Transaction Type',
  'Status',
] as const;

/** Lines are joined with CRLF per RFC4180 §2.1. */
const CRLF = '\r\n';

/**
 * Escapes a single field RFC4180-style: a value containing a comma, a double
 * quote, or a newline (CR or LF) is wrapped in double quotes, and an embedded
 * double quote is doubled (`"` → `""`). A separator-free value is left bare.
 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** The ordered field values for one row, matching CSV_HEADERS column-for-column. */
function rowToFields(row: TransactionRow): string[] {
  return [
    row.reference,
    row.transactionDate,
    row.account,
    row.description,
    String(row.amount),
    row.currency,
    row.transactionType,
    row.status,
  ];
}

/**
 * Serialises the supplied rows to a CSV string: a header row followed by one
 * line per row, in the supplied order, RFC4180-escaped and CRLF-joined.
 * Serialises EXACTLY the supplied set (BR6) — no re-sort, no extra rows.
 */
export function buildTransactionsCsv(rows: TransactionRow[]): string {
  const headerLine = CSV_HEADERS.map(escapeCsvField).join(',');
  const dataLines = rows.map((row) =>
    rowToFields(row).map(escapeCsvField).join(','),
  );
  return [headerLine, ...dataLines].join(CRLF);
}

/** The YYYY-MM-DD calendar day for a Date or ISO-ish date string (UTC). */
function isoDay(date: Date | string): string {
  const resolved = typeof date === 'string' ? new Date(date) : date;
  return resolved.toISOString().slice(0, 10);
}

/**
 * Lowercases and strips a filter value to a filename-safe token (alphanumerics
 * and hyphens only), so a value like "Approved" or a file id surfaces cleanly in
 * the name without introducing separators that would break the underscore-joined
 * structure.
 */
function filterToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds a filename reflecting the active filters and the injected date:
 * `transactions_<filter-summary>_<YYYY-MM-DD>.csv`. With no active filters no
 * stray filter tokens are emitted — the name carries only the date + extension,
 * marking the export as the unfiltered set. The date is a PARAMETER (never
 * new Date() internally) so the output is deterministic.
 */
export function buildTransactionsCsvFilename(
  filters: TransactionFilters,
  date: Date | string,
): string {
  const tokens: string[] = [];

  if (filters.status && filters.status.trim().length > 0) {
    tokens.push(filterToken(filters.status));
  }
  if (filters.fileLogId !== undefined && Number.isFinite(filters.fileLogId)) {
    tokens.push(`file-${filters.fileLogId}`);
  }
  if (filters.dateFrom && filters.dateFrom.trim().length > 0) {
    tokens.push(`from-${filterToken(filters.dateFrom)}`);
  }
  if (filters.dateTo && filters.dateTo.trim().length > 0) {
    tokens.push(`to-${filterToken(filters.dateTo)}`);
  }
  if (filters.amountMin !== undefined && Number.isFinite(filters.amountMin)) {
    tokens.push(`min-${filters.amountMin}`);
  }
  if (filters.amountMax !== undefined && Number.isFinite(filters.amountMax)) {
    tokens.push(`max-${filters.amountMax}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const token = filterToken(filters.search);
    if (token.length > 0) {
      tokens.push(`search-${token}`);
    }
  }

  const parts = ['transactions', ...tokens, isoDay(date)];
  return `${parts.join('_')}.csv`;
}
