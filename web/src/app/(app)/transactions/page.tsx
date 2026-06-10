'use client';

/**
 * Transactions (/transactions) — the read-only Transactions table (Epic 3,
 * Story 1).
 *
 * Replaces the Epic-1 placeholder (CLAUDE.md §7: the brief is the source of
 * truth; the placeholder is replaced, not extended). Mirrors the Epic-2 dashboard
 * page structure exactly: a client-side fetch → single-column sort → pagination
 * pipeline over the full list, full-width sortable column-header buttons that
 * advertise the active direction via aria-sort, an always-rendered pagination
 * control with a native rows-per-page select, and explicit loading / error
 * (with retry) / zero-data states.
 *
 * Data (R6 / §4): the full transactions list is fetched once via the shared API
 * client (GET /v1/transactions — no params, the approved spec gap — CLAUDE.md §3).
 * Sorting (R17) and pagination (R16) are derived client-side over that full list
 * via the pure helpers in @/lib/transactions and @/lib/table.
 *
 * Columns (R6): Reference, Transaction Date, Account, Description, Amount,
 * Currency, Transaction Type, Status — Status driving a colour-and-label badge
 * (§11). Amount is rendered as money (formatAmount) and sorts numerically.
 *
 * READ-ONLY (BR9 / AC-4): this story renders NO row-level mutating controls for
 * ANY role — no Approve, no Reject, no confirmation, no toast. Those land in
 * Epic 4. Both Importer and Approver see the same read-only view.
 *
 * Empty state (BR11): zero-DATA shows "No transactions yet" with NO creation
 * prompt — transactions are created by file import (Epic 2), not on this surface.
 *
 * Async UX (NFR5): explicit loading and error (with retry) states; the API error
 * is surfaced, never swallowed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { getTransactions } from '@/lib/api/transactions';
import {
  toTransactionRow,
  formatAmount,
  type TransactionRow,
} from '@/lib/transactions/mapping';
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

export default function TransactionsPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Sort over the full list (R17).
  const sortedRows = useMemo(
    () =>
      sortColumn ? sortTransactionRows(rows, sortColumn, sortDirection) : rows,
    [rows, sortColumn, sortDirection],
  );

  const totalPages = pageCount(sortedRows.length, pageSize);
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => paginate(sortedRows, currentPage, pageSize),
    [sortedRows, currentPage, pageSize],
  );

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

      {!isLoading && !loadError && rows.length > 0 && (
        <div className="flex flex-col gap-4">
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
        </div>
      )}
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
