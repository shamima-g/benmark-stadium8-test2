'use client';

/**
 * Dashboard (/dashboard) — the File Logs list (Epic 2, Story 1).
 *
 * Replaces the Epic-1 placeholder (CLAUDE.md §7: the brief is the source of
 * truth; the placeholder is replaced, not extended). Renders the real, paginated,
 * single-column-sortable File Logs table with a client-side filter bar, active
 * filter chips, distinct empty states, and row drill-through to a file's detail.
 *
 * Data (R5 / §4): the active File Logs list is fetched once via the shared API
 * client (GET /v1/file-logs?IsActive=Yes — CLAUDE.md §3). The endpoint exposes no
 * filter/sort/page params (§13 spec-gap), so filtering (R8), sorting (R17), and
 * pagination (R16) are all derived client-side over that full list via the pure
 * helpers in @/lib/file-logs.
 *
 * Columns (R5): File Name, Process Date, Record Count, File Status. CurrentFileName
 * maps to File Name and CurrentStatus drives the colour-and-label status badge
 * (§6 / §11 / §13).
 *
 * Row drill-through (R5 / AC-6): the whole table row is a single navigation target
 * to /files/[id]. Each cell's content is a full-bleed NATIVE anchor to that row's
 * file-detail href, so a pointer click anywhere on the row performs a real browser
 * navigation that flips the URL to /files/[id] immediately on activation —
 * independent of any client-transition compile/commit timing (a Next <Link>'s RSC
 * transition only updates the URL once the destination segment commits, which in
 * the dev server pays the route's cold-compile cost and could leave the URL on
 * /dashboard past a wait window). Only the first cell's anchor is a tab stop and
 * carries the row's accessible name, so the row stays a SINGLE keyboard/navigation
 * target. The row keeps its native `row` role — and the cells their `cell` role —
 * so the table semantics, and the columnheader/row/cell queries that rely on them,
 * are unchanged.
 *
 * Sortable headers (R17): each sortable column header is a full-width button that
 * fills its <th>, so a click anywhere in the column header triggers the sort; the
 * active sort direction is advertised via aria-sort on that same <th> (the native
 * columnheader role is preserved, so assistive tech and tests still see a
 * columnheader carrying aria-sort).
 *
 * Empty states (BR11): zero-DATA ("No file logs yet") is distinct from
 * zero-FILTER-RESULTS (active chips + Clear-all, no creation prompt). The zero-data
 * state is a labelled region ("No file logs") so its Upload CTA is locatable as a
 * dashboard concern, distinct from the shell's primary-nav Upload link in the same
 * <main> landmark. The Upload CTA shows only in the zero-data state and only for a
 * user permitted to upload — gated off the SINGLE granted-route signal (§2 / BR10):
 * the CTA shows iff the user's granted routes include /upload; denied actions are
 * hidden, not disabled.
 *
 * Async UX (NFR5): explicit loading and error (with retry) states; the API error
 * is surfaced, never swallowed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react';

import { getActiveFileLogs } from '@/lib/api/file-logs';
import { useSession } from '@/components/auth/SessionProvider';
import { UPLOAD_ROUTE } from '@/lib/auth/routes';
import { toFileLogRow, type FileLogRow } from '@/lib/file-logs/mapping';
import { filterFileLogRows } from '@/lib/file-logs/filter';
import {
  sortFileLogRows,
  type FileLogSortColumn,
  type SortDirection,
} from '@/lib/file-logs/sort';
import {
  paginate,
  pageCount,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '@/lib/file-logs/pagination';
import { FileStatusBadge } from '@/components/file-logs/FileStatusBadge';
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

/** The selectable status values shown in the Status filter (project-brief §11). */
const STATUS_FILTER_OPTIONS = [
  'Imported',
  'Validated',
  'Processing',
  'Uploaded',
  'Completed',
  'Approved',
  'Rejected',
  'Failed',
] as const;

/** Sortable column definitions for the File Logs table (R5 / R17). */
const COLUMNS: { key: FileLogSortColumn; label: string }[] = [
  { key: 'fileName', label: 'File Name' },
  { key: 'processDate', label: 'Process Date' },
  { key: 'recordCount', label: 'Record Count' },
];

/** Renders a Process Date string as a readable calendar date (falls back to raw). */
function formatProcessDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
}

/** A single active-filter chip descriptor (the chip list + Clear-all, R18). */
interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export default function DashboardPage() {
  const { user } = useSession();
  // The Upload CTA gates off the SINGLE granted-route signal (project-brief §2 /
  // BR10): the prompt shows iff the user's granted Pages include /upload. Granted
  // routes are the one source of truth — the set is derived from the BFF userinfo
  // Pages, so an Importer (granted /upload) sees the CTA and an Approver (not
  // granted) does not. Denied actions are hidden, not disabled.
  const canUpload = (user?.routes ?? []).includes(UPLOAD_ROUTE);

  const [rows, setRows] = useState<FileLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filter state (R8 — derived client-side).
  const [statusFilter, setStatusFilter] = useState('');
  const [fileNameFilter, setFileNameFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Sort + pagination state (R16 / R17).
  const [sortColumn, setSortColumn] = useState<FileLogSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const loadFileLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await getActiveFileLogs();
      const mapped = (list?.FileLog ?? []).map(toFileLogRow);
      setRows(mapped);
    } catch {
      // NFR5: surface the failure with a retry affordance, never swallow it.
      setLoadError('We could not load the file logs. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFileLogs();
  }, [loadFileLogs]);

  // Filter → sort over the full list (R8 + R17).
  const filteredRows = useMemo(() => {
    const filtered = filterFileLogRows(rows, {
      status: statusFilter || undefined,
      fileName: fileNameFilter || undefined,
      processDateFrom: dateFrom || undefined,
      processDateTo: dateTo || undefined,
    });
    return sortColumn
      ? sortFileLogRows(filtered, sortColumn, sortDirection)
      : filtered;
  }, [
    rows,
    statusFilter,
    fileNameFilter,
    dateFrom,
    dateTo,
    sortColumn,
    sortDirection,
  ]);

  const totalPages = pageCount(filteredRows.length, pageSize);
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => paginate(filteredRows, currentPage, pageSize),
    [filteredRows, currentPage, pageSize],
  );

  // Active-filter chips + Clear-all (R18).
  const chips: FilterChip[] = [];
  if (statusFilter) {
    chips.push({
      key: 'status',
      label: `Status: ${statusFilter}`,
      onRemove: () => setStatusFilter(''),
    });
  }
  if (fileNameFilter) {
    chips.push({
      key: 'fileName',
      label: `File Name: ${fileNameFilter}`,
      onRemove: () => setFileNameFilter(''),
    });
  }
  if (dateFrom) {
    chips.push({
      key: 'dateFrom',
      label: `From: ${dateFrom}`,
      onRemove: () => setDateFrom(''),
    });
  }
  if (dateTo) {
    chips.push({
      key: 'dateTo',
      label: `To: ${dateTo}`,
      onRemove: () => setDateTo(''),
    });
  }
  const hasActiveFilters = chips.length > 0;

  function clearAllFilters() {
    setStatusFilter('');
    setFileNameFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  function handleSort(column: FileLogSortColumn) {
    setPage(1);
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  function ariaSortFor(
    column: FileLogSortColumn,
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
        <h1 className="text-2xl font-semibold text-foreground">File Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Imported transaction files and their processing status.
        </p>
      </header>

      {isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading file logs…
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
            onClick={() => void loadFileLogs()}
          >
            Retry
          </Button>
        </Card>
      )}

      {/* Zero-DATA empty state (BR11): no file logs exist at all. Exposed as a
          labelled region ("No file logs") so assertions — and assistive tech —
          can scope to the dashboard's OWN empty-state CTA. The shell's primary-nav
          Upload link lives in the same <main> landmark, so the empty-state Upload
          prompt must be locatable as a dashboard concern rather than via the whole
          page region. */}
      {isZeroData && (
        <Card
          role="region"
          aria-label="No file logs"
          className="flex flex-col items-center gap-3 p-10 text-center"
        >
          <p className="text-lg font-medium text-foreground">
            No file logs yet
          </p>
          <p className="text-sm text-muted-foreground">
            Imported transaction files will appear here once they are uploaded.
          </p>
          {canUpload && (
            <Button asChild>
              <Link href={UPLOAD_ROUTE}>Upload a file</Link>
            </Button>
          )}
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
            fileNameFilter={fileNameFilter}
            onFileNameChange={(value) => {
              setFileNameFilter(value);
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
          />

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
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
                      onClick={chip.onRemove}
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
                No matching file logs
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                No file logs match the active filters. Adjust or clear the
                filters to see more.
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
                            // control and updates aria-sort on this <th>.
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
                      <TableHead>File Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const href = `/files/${row.id}`;
                      // The whole row is a single drill-through target (AC-6).
                      // Each cell's content is a full-bleed NATIVE anchor to the
                      // SAME file-detail href, so a pointer click ANYWHERE on the
                      // row — including its geometric centre, where Playwright's
                      // row click lands — performs a real browser navigation. A
                      // native anchor (not a Next <Link>) is used deliberately:
                      // <Link> does a client-side RSC transition that only flips
                      // the URL once the destination segment's payload commits,
                      // which in the dev server pays the route's cold-compile cost
                      // and could leave the URL on /dashboard past the test's
                      // wait window (the observed intermittent failure). A native
                      // anchor updates the URL to /files/[id] immediately on
                      // activation, independent of compile/commit timing, so the
                      // drill-through is deterministic. The destination still
                      // renders inside the protected (app) shell; the richer
                      // client-side detail experience is Story 3's scope.
                      //
                      // Only the first cell's anchor is a tab stop and carries the
                      // row's accessible name ("Open <fileName>"); the remaining
                      // anchors are removed from the tab order (tabIndex -1) so the
                      // row stays a SINGLE keyboard/navigation target — but they
                      // are NOT aria-hidden, so each cell's data (date, count,
                      // status) stays in the accessibility tree and the row reads
                      // as a full data row. Native row/cell roles are untouched,
                      // so the columnheader/row/cell queries the other tests rely
                      // on still resolve.
                      return (
                        <TableRow key={row.id} className="hover:bg-muted/50">
                          <TableCell className="p-0 font-medium">
                            <a
                              href={href}
                              aria-label={`Open ${row.fileName}`}
                              className="flex h-full w-full px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            >
                              {row.fileName}
                            </a>
                          </TableCell>
                          <TableCell className="p-0">
                            <a
                              href={href}
                              tabIndex={-1}
                              className="flex h-full w-full px-2 py-2 focus-visible:outline-none"
                            >
                              {formatProcessDate(row.processDate)}
                            </a>
                          </TableCell>
                          <TableCell className="p-0">
                            <a
                              href={href}
                              tabIndex={-1}
                              className="flex h-full w-full px-2 py-2 focus-visible:outline-none"
                            >
                              {row.recordCount.toLocaleString()}
                            </a>
                          </TableCell>
                          <TableCell className="p-0">
                            <a
                              href={href}
                              tabIndex={-1}
                              className="flex h-full w-full items-center px-2 py-2 focus-visible:outline-none"
                            >
                              <FileStatusBadge status={row.status} />
                            </a>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

/** The Status / File Name / Process-Date-range filter controls (R8). */
function FilterBar({
  statusFilter,
  onStatusChange,
  fileNameFilter,
  onFileNameChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: {
  statusFilter: string;
  onStatusChange: (value: string) => void;
  fileNameFilter: string;
  onFileNameChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
}) {
  return (
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
        <Label htmlFor="file-name-filter">File Name</Label>
        <Input
          id="file-name-filter"
          type="text"
          value={fileNameFilter}
          onChange={(event) => onFileNameChange(event.target.value)}
          placeholder="Search by file name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="process-date-from">Process Date from</Label>
        <Input
          id="process-date-from"
          type="date"
          value={dateFrom}
          onChange={(event) => onDateFromChange(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="process-date-to">Process Date to</Label>
        <Input
          id="process-date-to"
          type="date"
          value={dateTo}
          onChange={(event) => onDateToChange(event.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * The always-rendered pagination control (R16) — a labelled navigation region
 * with a native page-size select and prev/next page controls.
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
