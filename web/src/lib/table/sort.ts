/**
 * Generic single-column sort core for data tables (shared across Epic-2 File
 * Logs and Epic-3 Transactions).
 *
 * R17: a table sorts on a single column, ascending on first click and descending
 * on second; the active column/direction is indicated in the header (the page
 * owns the indicator + aria-sort). This module is the pure, NON-MUTATING
 * comparator core — it returns a new sorted array and leaves the input order
 * intact, so a page can re-sort a stable source list any number of times.
 *
 * Each column orders by its declared value-KIND, not by stringified value:
 *   - 'string' → lexical (locale-aware string compare)
 *   - 'number' → numeric (75 < 320.4 < 1500.5, not lexical where "1500.5" < "320.4")
 *   - 'date'   → chronological (Date-parsed millisecond compare)
 *
 * Per-domain modules (file-logs/sort, transactions/sort) bind their column union
 * to a value accessor + kind and delegate here, so this comparator is the one
 * place the asc/desc + value-kind semantics live.
 */

/** Sort direction — ascending (first click) or descending (second click). */
export type SortDirection = 'asc' | 'desc';

/** The value-kind a column sorts by — drives numeric vs date vs lexical order. */
export type SortValueKind = 'string' | 'number' | 'date';

/**
 * Three-way comparison of two raw values for the given kind (ascending order).
 * Numbers compare numerically, dates chronologically (via Date parsing), and
 * strings lexically (locale-aware). Returns <0, 0, or >0.
 */
export function compareValues(
  a: unknown,
  b: unknown,
  kind: SortValueKind,
): number {
  switch (kind) {
    case 'number':
      return Number(a) - Number(b);
    case 'date':
      return new Date(a as string).getTime() - new Date(b as string).getTime();
    case 'string':
      return String(a).localeCompare(String(b));
  }
}

/**
 * Returns a new array of rows sorted by the value the accessor reads from each
 * row, compared as the given kind, in the given direction. Pure: the input array
 * is not mutated (callers rely on this so the unsorted source list stays stable
 * across re-sorts).
 */
export function sortRows<T>(
  rows: T[],
  accessor: (row: T) => unknown,
  kind: SortValueKind,
  direction: SortDirection,
): T[] {
  const sorted = [...rows].sort((a, b) =>
    compareValues(accessor(a), accessor(b), kind),
  );
  return direction === 'desc' ? sorted.reverse() : sorted;
}
