/**
 * Single-column sort comparator for the File Logs dashboard (Epic 2, Story 1).
 *
 * R17: the table sorts on a single column, ascending on first click and
 * descending on second; the active column/direction is indicated in the header
 * (the page owns the indicator + aria-sort). This module is the pure, NON-MUTATING
 * comparator — it returns a new sorted array and leaves the input order intact.
 *
 * The sort/asc-desc/value-kind semantics now live in the shared generic table
 * core (@/lib/table/sort); this module binds the File Logs column union to a
 * value accessor + kind and delegates. No behaviour change from the original
 * per-column comparator:
 *   - fileName    → lexical (locale-aware string compare)
 *   - processDate → chronological (date compare)
 *   - recordCount → numeric (47 < 760 < 3000, not lexical where "3000" < "47")
 */

import type { FileLogRow } from './mapping';
import { sortRows, type SortValueKind } from '@/lib/table/sort';

/** Sort direction — re-exported from the generic core (preserves the call sites). */
export type { SortDirection } from '@/lib/table/sort';

/** The columns the File Logs table can sort on. */
export type FileLogSortColumn = 'fileName' | 'processDate' | 'recordCount';

/** Each sortable column's value accessor + the kind it orders by. */
const COLUMN_SORT: Record<
  FileLogSortColumn,
  { accessor: (row: FileLogRow) => unknown; kind: SortValueKind }
> = {
  fileName: { accessor: (row) => row.fileName, kind: 'string' },
  processDate: { accessor: (row) => row.processDate, kind: 'date' },
  recordCount: { accessor: (row) => row.recordCount, kind: 'number' },
};

/**
 * Returns a new array of rows sorted by the given column and direction. Pure: the
 * input array is not mutated (the page relies on this so the unsorted source list
 * remains stable across re-sorts). Delegates to the generic table sort core.
 */
export function sortFileLogRows(
  rows: FileLogRow[],
  column: FileLogSortColumn,
  direction: import('@/lib/table/sort').SortDirection,
): FileLogRow[] {
  const { accessor, kind } = COLUMN_SORT[column];
  return sortRows(rows, accessor, kind, direction);
}
