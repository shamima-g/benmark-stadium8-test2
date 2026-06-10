/**
 * Pagination slicing for the File Logs dashboard (Epic 2, Story 1).
 *
 * R16: the table paginates with page-size options 5 / 10 / 20 / 50 (default 20),
 * and the pagination control is always rendered (even for a single page — the
 * page owns that always-visible control). This module is the pure slicing helper.
 */

import type { FileLogRow } from './mapping';

/** The selectable page sizes (R16). */
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

/** The default page size (R16). */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Returns the slice of rows for the given 1-based page and page size. A page that
 * exceeds the row count yields an empty slice; a page size larger than the row
 * count yields all rows on page 1. Pure — the input array is not mutated.
 */
export function paginate(
  rows: FileLogRow[],
  page: number,
  pageSize: number,
): FileLogRow[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** The total number of pages for a row count at the given page size (min 1). */
export function pageCount(totalRows: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalRows / pageSize));
}
