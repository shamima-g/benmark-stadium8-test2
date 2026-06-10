/**
 * Single-column sort comparator for the File Logs dashboard (Epic 2, Story 1).
 *
 * R17: the table sorts on a single column, ascending on first click and
 * descending on second; the active column/direction is indicated in the header
 * (the page owns the indicator + aria-sort). This module is the pure, NON-MUTATING
 * comparator — it returns a new sorted array and leaves the input order intact.
 *
 * Each sortable column orders by its natural value-type, not by stringified value:
 *   - fileName    → lexical (locale-aware string compare)
 *   - processDate → chronological (date compare)
 *   - recordCount → numeric (47 < 760 < 3000, not lexical where "3000" < "47")
 */

import type { FileLogRow } from './mapping';

/** The columns the File Logs table can sort on. */
export type FileLogSortColumn = 'fileName' | 'processDate' | 'recordCount';

/** Sort direction — ascending (first click) or descending (second click). */
export type SortDirection = 'asc' | 'desc';

/** Three-way comparison of two rows on the given column (ascending order). */
function compareAsc(
  a: FileLogRow,
  b: FileLogRow,
  column: FileLogSortColumn,
): number {
  switch (column) {
    case 'recordCount':
      return a.recordCount - b.recordCount;
    case 'processDate':
      return (
        new Date(a.processDate).getTime() - new Date(b.processDate).getTime()
      );
    case 'fileName':
      return a.fileName.localeCompare(b.fileName);
  }
}

/**
 * Returns a new array of rows sorted by the given column and direction. Pure: the
 * input array is not mutated (the page relies on this so the unsorted source list
 * remains stable across re-sorts).
 */
export function sortFileLogRows(
  rows: FileLogRow[],
  column: FileLogSortColumn,
  direction: SortDirection,
): FileLogRow[] {
  const sorted = [...rows].sort((a, b) => compareAsc(a, b, column));
  return direction === 'desc' ? sorted.reverse() : sorted;
}
