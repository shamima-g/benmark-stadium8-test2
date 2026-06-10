/**
 * Pagination slicing for the File Logs dashboard (Epic 2, Story 1).
 *
 * R16: the table paginates with page-size options 5 / 10 / 20 / 50 (default 20),
 * and the pagination control is always rendered (even for a single page — the
 * page owns that always-visible control).
 *
 * The slicing + page-size contract now lives in the shared generic table core
 * (@/lib/table/pagination); this module re-exports it unchanged so the File Logs
 * dashboard and its tests keep the same import surface and behaviour. The generic
 * `paginate<T>` is structurally identical to the original FileLogRow-typed
 * helper, so File Logs callers are unaffected.
 */

export {
  paginate,
  pageCount,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '@/lib/table/pagination';
