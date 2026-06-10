/**
 * Deep-link-in parsing and active-chip descriptors for the Transactions filter
 * bar (Epic 3, Story 2; R7 / R18).
 *
 * The Epic-2 file-detail status counts drill through to this screen via
 * buildTransactionsHref (@/lib/files/statusCounts), which emits
 * /transactions?fileLogId=<id>&status=<Status>. parseTransactionFilterParams
 * reads those exact param names back into the page's initial filter state on
 * first render, present/absent/malformed-safe (a non-numeric fileLogId is
 * dropped, NOT coerced to NaN — a NaN would silently match nothing; an unknown
 * status is dropped; absent params yield an empty filter set; never throws).
 *
 * activeFilterChips derives one self-describing chip descriptor per active
 * criterion (R18) so the page can render the chip list + Clear-all without
 * re-deriving the labels.
 */

import type { TransactionFilters } from './filter';

/** The status vocabulary the drill-through can pre-apply (project-brief §11). */
const KNOWN_STATUSES = ['Imported', 'Approved', 'Rejected'] as const;

/** Resolves a raw status param to its canonical casing, or undefined if unknown. */
function canonicalStatus(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const match = KNOWN_STATUSES.find(
    (status) => status.toLowerCase() === raw.trim().toLowerCase(),
  );
  return match;
}

/**
 * Parses the ?fileLogId=&status= query params into the initial TransactionFilters
 * state. The param names match buildTransactionsHref (`fileLogId`, `status`).
 *   - fileLogId: parsed to a number ONLY when the whole value is a valid integer;
 *     a non-numeric value is dropped (never coerced to NaN).
 *   - status: kept ONLY when it matches a known status (canonicalised casing);
 *     unknown values are dropped.
 *   - absent params yield an empty filter set. Never throws.
 */
export function parseTransactionFilterParams(
  searchParams: URLSearchParams,
): TransactionFilters {
  const filters: TransactionFilters = {};

  const rawFileLogId = searchParams.get('fileLogId');
  if (rawFileLogId !== null && /^\d+$/.test(rawFileLogId.trim())) {
    const parsed = Number(rawFileLogId.trim());
    if (Number.isInteger(parsed)) {
      filters.fileLogId = parsed;
    }
  }

  const status = canonicalStatus(searchParams.get('status'));
  if (status !== undefined) {
    filters.status = status;
  }

  return filters;
}

/** A single active-filter chip descriptor: a stable key and a user-readable label. */
export interface FilterChipDescriptor {
  key: string;
  label: string;
}

/** Whether a (possibly empty) string filter value is meaningfully set. */
function isSet(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/** Whether a numeric filter bound is meaningfully set. */
function isNumberSet(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

/**
 * Derives one chip descriptor per ACTIVE criterion (R18). Each chip carries a
 * stable, unique key (so React can render the list without collisions) and a
 * self-describing label that names its criterion and value. An empty filter set
 * yields no chips.
 */
export function activeFilterChips(
  filters: TransactionFilters,
): FilterChipDescriptor[] {
  const chips: FilterChipDescriptor[] = [];

  if (isSet(filters.status)) {
    chips.push({ key: 'status', label: `Status: ${filters.status}` });
  }
  if (filters.fileLogId !== undefined) {
    chips.push({ key: 'fileLogId', label: `File: ${filters.fileLogId}` });
  }
  if (isSet(filters.dateFrom)) {
    chips.push({ key: 'dateFrom', label: `From: ${filters.dateFrom}` });
  }
  if (isSet(filters.dateTo)) {
    chips.push({ key: 'dateTo', label: `To: ${filters.dateTo}` });
  }
  if (isNumberSet(filters.amountMin)) {
    chips.push({ key: 'amountMin', label: `Min amount: ${filters.amountMin}` });
  }
  if (isNumberSet(filters.amountMax)) {
    chips.push({ key: 'amountMax', label: `Max amount: ${filters.amountMax}` });
  }
  if (isSet(filters.search)) {
    chips.push({ key: 'search', label: `Search: ${filters.search}` });
  }

  return chips;
}
