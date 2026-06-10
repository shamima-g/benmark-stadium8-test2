'use client';

/**
 * Transactions (/transactions) — the read-only Transactions table with client-side
 * filtering & search (Epic 3, Stories 1 & 2).
 *
 * Story 1 built the fetch → sort → paginate pipeline and the table. Story 2 LAYERS
 * R7 filtering onto it without rebuilding the table: a filter bar (Status / File /
 * Transaction-Date range / Amount range / free-text on Reference + Account Number),
 * active-filter chips with a single Clear-all (R18), a zero-FILTER-results state
 * distinct from the zero-DATA state (BR11), and a deep-link-in that reads
 * ?fileLogId=&status= and pre-applies them as initial filters (the Epic-2
 * file-detail status-count drill-through; AC-4).
 *
 * Data (R6 / §4): the full transactions list is fetched once via the shared API
 * client (GET /v1/transactions — no params, the approved spec gap — CLAUDE.md §3).
 * Filtering (R7), sorting (R17) and pagination (R16) are all derived client-side
 * over that full list. The pipeline order is filter → sort → paginate; changing a
 * filter resets to page 1.
 *
 * Columns (R6): Reference, Transaction Date, Account, Description, Amount,
 * Currency, Transaction Type, Status — Status driving a colour-and-label badge
 * (§11). Amount is rendered as money (formatAmount) and sorts numerically.
 *
 * READ-ONLY (BR9 / AC-4): this surface renders NO row-level mutating controls for
 * ANY role — no Approve, no Reject, no export. Export is Story 3; mutations are
 * Epic 4. Both Importer and Approver see the same read-only filtered view.
 *
 * Empty states (BR11): zero-DATA shows "No transactions yet" (no creation prompt —
 * transactions are created by file import in Epic 2). zero-FILTER-results shows a
 * DISTINCT no-match message and keeps the active chips + Clear-all visible so the
 * user can recover.
 *
 * Async UX (NFR5): explicit loading and error (with retry) states; the API error
 * is surfaced, never swallowed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react';

import { getTransactions } from '@/lib/api/transactions';
import {
  toTransactionRow,
  formatAmount,
  type TransactionRow,
} from '@/lib/transactions/mapping';
import {
  filterTransactionRows,
  type TransactionFilters,
} from '@/lib/transactions/filter';
import {
  parseTransactionFilterParams,
  activeFilterChips,
} from '@/lib/transactions/deepLink';
import {
  sortTransactionRows,
  type TransactionSortColumn,
  type SortDirection,
} from '@/lib/transactions/sort';
import {
  paginate,
  pageCount,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '@/lib/table/pagination';
import { TransactionStatusBadge } from '@/components/transactions/TransactionStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** The Transactions table columns (R6). Status is rendered as a badge, not sorted text. */
const COLUMNS: { key: TransactionSortColumn; label: string }[] = [
  { key: 'reference', label: 'Reference' },
  { key: 'transactionDate', label: 'Transaction Date' },
  { key: 'account', label: 'Account' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency' },
  { key: 'transactionType', label: 'Transaction Type' },
  { key: 'status', label: 'Status' },
];

/** The selectable status values shown in the Status filter (project-brief §11). */
const STATUS_FILTER_OPTIONS = ['Imported', 'Approved', 'Rejected'] as const;

/** Renders a Transaction Date string as a readable calendar date (falls back to raw). */
function formatTransactionDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
}

/** Parses a free-text numeric input into a finite number, or undefined when blank/invalid. */
function toAmountBound(value: string): number | undefined {
  if (value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function TransactionsPage() {
  // Deep-link-in (AC-4): read ?fileLogId=&status= ONCE and seed the initial
  // filter state. useSearchParams is read on first render; the parsed result
  // becomes the starting filter values.
  const searchParams = useSearchParams();
  const [initialFilters] = useState<TransactionFilters>(() =>
    parseTransactionFilterParams(
      new URLSearchParams(searchParams?.toString() ?? ''),
    ),
  );

  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filter state (R7 — derived client-side). Seeded from the deep-link params.
  const [statusFilter, setStatusFilter] = useState(initialFilters.status ?? '');
  const [fileLogIdFilter, setFileLogIdFilter] = useState(
    initialFilters.fileLogId !== undefined
      ? String(initialFilters.fileLogId)
      : '',
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [search, setSearch] = useState('');

  // Sort + pagination state (R16 / R17).
  const [sortColumn, setSortColumn] = useState<TransactionSortColumn | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await getTransactions();
      const mapped = (list?.Transactions ?? []).map(toTransactionRow);
      setRows(mapped);
    } catch {
      // NFR5: surface the failure with a retry affordance, never swallow it.
      setLoadError('We could not load the transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  // The distinct files present in the data, for the File filter options. The
  // FileLogId is the option value (matching the deep-link param + the Playwright
  // selectOption(String(fileLogId)) contract); the file name labels the option.
  const fileOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows) {
      if (!seen.has(row.fileLogId)) {
        seen.set(row.fileLogId, `File ${row.fileLogId}`);
      }
    }
    return Array.from(seen, ([id, label]) => ({ id, label })).sort(
      (a, b) => a.id - b.id,
    );
  }, [rows]);

  // The active filter set (typed) used by both the predicate and the chip list.
  const filters = useMemo<TransactionFilters>(
    () => ({
      status: statusFilter || undefined,
      fileLogId:
        fileLogIdFilter.trim().length > 0 ? Number(fileLogIdFilter) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      amountMin: toAmountBound(amountMin),
      amountMax: toAmountBound(amountMax),
      search: search || undefined,
    }),
    [
      statusFilter,
      fileLogIdFilter,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
      search,
    ],
  );

  // Filter → sort over the full list (R7 + R17).
  const filteredRows = useMemo(() => {
    const filtered = filterTransactionRows(rows, filters);
    return sortColumn
      ? sortTransactionRows(filtered, sortColumn, sortDirection)
      : filtered;
  }, [rows, filters, sortColumn, sortDirection]);

  const totalPages = pageCount(filteredRows.length, pageSize);
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => paginate(filteredRows, currentPage, pageSize),
    [filteredRows, currentPage, pageSize],
  );

  // Active-filter chips + Clear-all (R18). Each chip's remover clears its own
  // criterion; the descriptors (key/label) come from the shared helper so the
  // labels match the unit-tested chip contract.
  const chipRemovers: Record<string, () => void> = {
    status: () => setStatusFilter(''),
    fileLogId: () => setFileLogIdFilter(''),
    dateFrom: () => setDateFrom(''),
    dateTo: () => setDateTo(''),
    amountMin: () => setAmountMin(''),
    amountMax: () => setAmountMax(''),
    search: () => setSearch(''),
  };
  const chips = activeFilterChips(filters);
  const hasActiveFilters = chips.length > 0;

  function removeChip(key: string) {
    setPage(1);
    chipRemovers[key]?.();
  }

  function clearAllFilters() {
    setStatusFilter('');
    setFileLogIdFilter('');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
    setSearch('');
    setPage(1);
  }

  function handleSort(column: TransactionSortColumn) {
    setPage(1);
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function ariaSortFor(
    column: TransactionSortColumn,
  ): 'ascending' | 'descending' | 'none' {
    if (sortColumn !== column) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  const isZeroData = !isLoading && !loadError && rows.length === 0;
  const isZeroFilterResults =
    !isLoading && !loadError && rows.length > 0 && filteredRows.length === 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Imported bank transactions and their approval status.
        </p>
      </header>

      {isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading transactions…
        </p>
      )}

      {loadError && (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadTransactions()}
          >
            Retry
          </Button>
        </Card>
      )}

      {/* Zero-DATA empty state (BR11): no transactions exist at all. Read-only
          surface — transactions are created by file import (Epic 2), so there is
          NO creation prompt here. */}
      {isZeroData && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-lg font-medium text-foreground">
            No transactions yet
          </p>
          <p className="text-sm text-muted-foreground">
            Imported transactions will appear here once a file has been
            processed.
          </p>
        </Card>
      )}

      {/* The filter bar + table render whenever data exists (even when a filter
          narrows it to zero — that zero-filter-results state keeps the chips and
          Clear-all available, distinct from the no-data state above). */}
      {!isLoading && !loadError && rows.length > 0 && (
        <div className="flex flex-col gap-4">
          <FilterBar
            statusFilter={statusFilter}
            onStatusChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            fileLogIdFilter={fileLogIdFilter}
            fileOptions={fileOptions}
            onFileChange={(value) => {
              setFileLogIdFilter(value);
              setPage(1);
            }}
            dateFrom={dateFrom}
            onDateFromChange={(value) => {
              setDateFrom(value);
              setPage(1);
            }}
            dateTo={dateTo}
            onDateToChange={(value) => {
              setDateTo(value);
              setPage(1);
            }}
            amountMin={amountMin}
            onAmountMinChange={(value) => {
              setAmountMin(value);
              setPage(1);
            }}
            amountMax={amountMax}
            onAmountMaxChange={(value) => {
              setAmountMax(value);
              setPage(1);
            }}
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />

          {hasActiveFilters && (
            <div
              role="group"
              aria-label="Active filters"
              className="flex flex-wrap items-center gap-2"
            >
              <ul
                className="flex flex-wrap items-center gap-2"
                aria-label="Active filters"
              >
                {chips.map((chip) => (
                  <li
                    key={chip.key}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                  >
                    <span>{chip.label}</span>
                    <button
                      type="button"
                      onClick={() => removeChip(chip.key)}
                      aria-label={`Remove filter ${chip.label}`}
                      className="rounded-full p-0.5 hover:bg-accent"
                    >
                      <XIcon className="size-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
              >
                Clear all
              </Button>
            </div>
          )}

          {isZeroFilterResults ? (
            <Card className="p-10 text-center">
              <p className="text-sm font-medium text-foreground">
                No matching transactions
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adjust or clear the active filters to see more transactions.
              </p>
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {COLUMNS.map((column) => {
                        const active = sortColumn === column.key;
                        return (
                          <TableHead
                            key={column.key}
                            aria-sort={ariaSortFor(column.key)}
                            // No padding on the cell itself: the inner button is
                            // full-width so a click anywhere in the header cell —
                            // including its geometric centre — lands on the sort
                            // control and updates aria-sort on this <th> (mirrors the
                            // dashboard's sortable-header pattern).
                            className="p-0"
                          >
                            <button
                              type="button"
                              onClick={() => handleSort(column.key)}
                              className="flex w-full items-center gap-1 px-2 py-2.5 text-left font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {column.label}
                              {active &&
                                (sortDirection === 'asc' ? (
                                  <ArrowUpIcon
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <ArrowDownIcon
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                ))}
                            </button>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.reference}
                        </TableCell>
                        <TableCell>
                          {formatTransactionDate(row.transactionDate)}
                        </TableCell>
                        <TableCell>{row.account}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(row.amount, row.currency)}
                        </TableCell>
                        <TableCell>{row.currency}</TableCell>
                        <TableCell>{row.transactionType}</TableCell>
                        <TableCell>
                          <TransactionStatusBadge status={row.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <PaginationBar
                page={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The R7 filter controls: Status, File, Transaction-Date range, Amount range, and
 * a free-text search box matching Reference OR Account Number. Mirrors the
 * dashboard's FilterBar layout and control conventions.
 */
function FilterBar({
  statusFilter,
  onStatusChange,
  fileLogIdFilter,
  fileOptions,
  onFileChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  amountMin,
  onAmountMinChange,
  amountMax,
  onAmountMaxChange,
  search,
  onSearchChange,
}: {
  statusFilter: string;
  onStatusChange: (value: string) => void;
  fileLogIdFilter: string;
  fileOptions: { id: number; label: string }[];
  onFileChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  amountMin: string;
  onAmountMinChange: (value: string) => void;
  amountMax: string;
  onAmountMaxChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status-filter">Status</Label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">All statuses</option>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="file-filter">File</Label>
          <select
            id="file-filter"
            value={fileLogIdFilter}
            onChange={(event) => onFileChange(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">All files</option>
            {fileOptions.map((file) => (
              <option key={file.id} value={file.id}>
                {file.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-from">Date from</Label>
          <Input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date-to">Date to</Label>
          <Input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount-min">Amount min</Label>
          <Input
            id="amount-min"
            type="number"
            inputMode="decimal"
            value={amountMin}
            onChange={(event) => onAmountMinChange(event.target.value)}
            placeholder="Min amount"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount-max">Amount max</Label>
          <Input
            id="amount-max"
            type="number"
            inputMode="decimal"
            value={amountMax}
            onChange={(event) => onAmountMaxChange(event.target.value)}
            placeholder="Max amount"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="transaction-search">
            Search reference or account number
          </Label>
          <Input
            id="transaction-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by reference or account number"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The always-rendered pagination control (R16) — a labelled navigation region
 * with a native page-size select and prev/next page controls. Mirrors the
 * dashboard's PaginationBar.
 */
function PaginationBar({
  page,
  totalPages,
  pageSize,
  onPageSizeChange,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="page-size" className="text-sm text-muted-foreground">
          Rows per page
        </Label>
        <select
          id="page-size"
          aria-label="Rows per page"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </nav>
  );
}
