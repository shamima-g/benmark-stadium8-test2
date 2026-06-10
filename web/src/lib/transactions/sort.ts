/**
 * Single-column sort comparator for the Transactions table (Epic 3, Story 1).
 *
 * R17: the table sorts on a single column, ascending on first click and
 * descending on second; the active column/direction is indicated in the header
 * (the page owns the indicator + aria-sort). This module binds the Transactions
 * column union to a value accessor + kind and delegates to the shared generic
 * table sort core (@/lib/table/sort), so the asc/desc + value-kind semantics live
 * in one place. Pure — the input order is preserved.
 *
 *   - amount          → numeric  (75 < 320.4 < 1500.5, not lexical)
 *   - transactionDate → date     (chronological)
 *   - everything else → string   (lexical, locale-aware)
 */

import type { TransactionRow } from './mapping';
import { sortRows, type SortValueKind } from '@/lib/table/sort';

/** Sort direction — re-exported from the generic core (preserves call sites). */
export type { SortDirection } from '@/lib/table/sort';

/** The columns the Transactions table can sort on (R6 / R17). */
export type TransactionSortColumn =
  | 'reference'
  | 'transactionDate'
  | 'account'
  | 'description'
  | 'amount'
  | 'currency'
  | 'transactionType'
  | 'status';

/** Each sortable column's value accessor + the kind it orders by. */
const COLUMN_SORT: Record<
  TransactionSortColumn,
  { accessor: (row: TransactionRow) => unknown; kind: SortValueKind }
> = {
  reference: { accessor: (row) => row.reference, kind: 'string' },
  transactionDate: { accessor: (row) => row.transactionDate, kind: 'date' },
  account: { accessor: (row) => row.account, kind: 'string' },
  description: { accessor: (row) => row.description, kind: 'string' },
  amount: { accessor: (row) => row.amount, kind: 'number' },
  currency: { accessor: (row) => row.currency, kind: 'string' },
  transactionType: { accessor: (row) => row.transactionType, kind: 'string' },
  status: { accessor: (row) => row.status, kind: 'string' },
};

/**
 * Returns a new array of rows sorted by the given column and direction. Pure: the
 * input array is not mutated. Delegates to the generic table sort core.
 */
export function sortTransactionRows(
  rows: TransactionRow[],
  column: TransactionSortColumn,
  direction: import('@/lib/table/sort').SortDirection,
): TransactionRow[] {
  const { accessor, kind } = COLUMN_SORT[column];
  return sortRows(rows, accessor, kind, direction);
}
