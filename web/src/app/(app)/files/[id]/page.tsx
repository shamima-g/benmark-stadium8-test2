'use client';

/**
 * File detail (/files/[id]) — read-only Summary & Status-Count Drill-Through
 * (Epic 2, Story 3; R12 / BR4) PLUS Importer-only lifecycle controls
 * (Epic 2, Story 4; R13 / R14 / R15 / BR5 / BR7 / BR10).
 *
 * Replaces the Epic-2 Story-1 placeholder at this path (CLAUDE.md §7: the brief
 * is the source of truth; the placeholder is replaced, not extended). The page
 * is the shared file-detail surface readable by BOTH the Importer and the
 * Approver (project-brief §2). Story 4 layers the Importer-only lifecycle
 * controls onto this shell — the read-only summary is unchanged.
 *
 * Route params: Next 16 passes `params` as a Promise. It is resolved in an
 * effect (rather than via React's `use()`) so the page renders its loading state
 * SYNCHRONOUSLY on first paint — `use()` suspends the whole subtree until the
 * promise settles, which would swallow the loading affordance the async-UX
 * contract (NFR5) requires. Resolving in an effect keeps the loading state
 * observable and the data fetch fires once the id is known.
 *
 * Data (R12 / R15 / §4 / Epic 2 spec-gap):
 *   - The transactions API exposes no single-file GET, so the page fetches the
 *     active File Logs list (GET /v1/file-logs?IsActive=Yes) and SELECTS the
 *     FileLog whose Id matches the route id — identical to the Story-1 dashboard
 *     contract. An id with no matching FileLog is treated as not-found.
 *   - It fetches the full transactions list (GET /v1/transactions — no FileLogId
 *     / Status filter params, the documented spec gap) and tallies the status
 *     counts client-side via computeStatusCounts (filter by FileLogId). The same
 *     list feeds the BR7 cancel-eligibility predicate (canCancelFile).
 *   - When the file is Failed (BR5), it additionally fetches the validation-error
 *     rows (GET /v1/files/validation-errors — JsonArray is a STRING that must be
 *     JSON.parsed) and the column metadata (GET /v1/files/validation-errors/
 *     columns), and renders the dynamic invalid-rows grid.
 *   All calls go through the shared API client (CLAUDE.md §3).
 *
 * Lifecycle controls (BR10 — Importer-only, hidden from Approvers):
 *   - Retry Validation (R13): a Failed file's Importer can re-run validation
 *     (POST /v1/files/retry-validation?LogId=); on success the page re-reads the
 *     file-logs list so the displayed File Status reflects the new state.
 *   - Cancel File (R14 / BR7): an Importer can cancel the file via a destructive
 *     alert-dialog confirmation NAMING the file, with default focus on the safe
 *     dismiss action (Radix AlertDialogCancel). The dialog's safe action is
 *     labelled "Keep file" and the destructive action "Delete file" so the two
 *     read unambiguously (the in-page trigger keeps the user-facing "Cancel File"
 *     verb). Confirming issues DELETE /v1/files?LogId= with a LastChangedUser
 *     header, then navigates back to the dashboard. When the file has any
 *     Approved transaction (canCancelFile is false) the modal never opens — an
 *     explanatory in-main role=alert banner is shown instead and no DELETE fires.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getActiveFileLogs } from '@/lib/api/file-logs';
import { getTransactions } from '@/lib/api/transactions';
import {
  getValidationErrors,
  getValidationErrorColumns,
} from '@/lib/api/validation-errors';
import { FileStatusBadge } from '@/components/file-logs/FileStatusBadge';
import {
  buildTransactionsHref,
  computeStatusCounts,
  isFileWorkInProgress,
  type DrillableStatus,
  type StatusCounts,
} from '@/lib/files/statusCounts';
import {
  parseValidationErrors,
  resolveValidationColumns,
  type ValidationErrorRow,
} from '@/lib/files/validationErrors';
import { canCancelFile } from '@/lib/files/cancelEligibility';
import { canUseFileLifecycleControls } from '@/lib/files/lifecycleGating';
import { cancelFile, retryFileValidation } from '@/lib/files/lifecycleRequests';
import { useSession } from '@/components/auth/SessionProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ColumnDefinition, FileLog, TransactionRead } from '@/types/api';

/**
 * The drillable per-status counts, in display order, paired with the StatusCounts
 * key each reads. Total is rendered separately (it has no filtered slice to drill
 * into).
 */
const DRILLABLE_STATUSES: {
  status: DrillableStatus;
  key: keyof StatusCounts;
}[] = [
  { status: 'Imported', key: 'imported' },
  { status: 'Approved', key: 'approved' },
  { status: 'Rejected', key: 'rejected' },
];

/** Files in this status surface the validation-errors view + Retry (BR5). */
function isFailedStatus(status: string): boolean {
  return status.trim().toLowerCase() === 'failed';
}

interface FileDetailData {
  fileLog: FileLog | null;
  transactions: TransactionRead[];
}

interface ValidationGrid {
  columns: ColumnDefinition[];
  rows: ValidationErrorRow[];
}

export default function FileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { user } = useSession();
  const canUseControls = canUseFileLifecycleControls(user?.roles ?? []);

  const [fileLogId, setFileLogId] = useState<number | null>(null);
  const [data, setData] = useState<FileDetailData | null>(null);
  const [validationGrid, setValidationGrid] = useState<ValidationGrid | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // BR7 cancel-blocked banner: shown in-main (role=alert) when Cancel is clicked
  // on a file that has an Approved transaction. The destructive modal never opens.
  const [showBlockedBanner, setShowBlockedBanner] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Tracks the latest in-flight load so a settled-but-stale fetch never writes
  // its result. Bumped on each load() invocation; only the run whose token still
  // matches the current ref commits its state.
  const loadTokenRef = useRef(0);

  // Resolve the route id from the params promise. Done in an effect so the
  // loading state renders synchronously (see the file-level note on `use()`).
  useEffect(() => {
    let active = true;
    void params.then(({ id }) => {
      if (active) {
        setFileLogId(Number(id));
      }
    });
    return () => {
      active = false;
    };
  }, [params]);

  const load = useCallback(async () => {
    if (fileLogId === null) {
      return;
    }
    // Claim this run. Any earlier run that settles after us is now stale and
    // must not write — its token no longer matches the ref.
    const token = ++loadTokenRef.current;
    const isStale = () => loadTokenRef.current !== token;

    setIsLoading(true);
    setLoadError(null);
    try {
      // Both calls go through the shared API client. The file-logs list locates
      // the FileLog by id (no single-file GET); the transactions list is tallied
      // client-side by FileLogId.
      const [fileLogList, transactionList] = await Promise.all([
        getActiveFileLogs(),
        getTransactions(),
      ]);
      if (isStale()) {
        return;
      }
      const fileLog =
        (fileLogList?.FileLog ?? []).find((log) => log.Id === fileLogId) ??
        null;
      setData({
        fileLog,
        transactions: transactionList?.Transactions ?? [],
      });

      // BR5 / R15: a Failed file additionally surfaces its validation-errors grid.
      // The rows arrive as a JSON STRING (JsonArray) that must be parsed; the
      // columns are resolved dynamically (Visible-only, declared order).
      if (fileLog && isFailedStatus(fileLog.CurrentStatus)) {
        const [errors, columns] = await Promise.all([
          getValidationErrors(fileLog.Id),
          getValidationErrorColumns(fileLog.Id),
        ]);
        if (isStale()) {
          return;
        }
        setValidationGrid({
          rows: parseValidationErrors(
            errors?.ValidationErrors?.JsonArray ?? '',
          ),
          columns: resolveValidationColumns(columns?.ColumnList ?? []),
        });
      } else {
        setValidationGrid(null);
      }
    } catch {
      if (isStale()) {
        return;
      }
      // NFR5 / NFR8: surface the failure with a retry affordance, never swallow it.
      setLoadError('We could not load this file. Please try again.');
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  }, [fileLogId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => computeStatusCounts(data?.transactions ?? [], fileLogId ?? -1),
    [data, fileLogId],
  );

  const cancellable = useMemo(
    () => canCancelFile(data?.transactions ?? [], fileLogId ?? -1),
    [data, fileLogId],
  );

  // R13: re-run validation, then re-read so the displayed File Status updates.
  const handleRetry = useCallback(async () => {
    if (fileLogId === null) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryFileValidation(fileLogId);
      await load();
    } catch {
      setLoadError('We could not retry validation. Please try again.');
    } finally {
      setIsRetrying(false);
    }
  }, [fileLogId, load]);

  // R14 / BR7: open the destructive confirmation only when the file is eligible;
  // otherwise surface the explanatory banner and never open the modal.
  const handleCancelClick = useCallback(() => {
    if (cancellable) {
      setShowBlockedBanner(false);
      setIsCancelDialogOpen(true);
    } else {
      setIsCancelDialogOpen(false);
      setShowBlockedBanner(true);
    }
  }, [cancellable]);

  const handleConfirmCancel = useCallback(async () => {
    if (fileLogId === null) {
      return;
    }
    setIsCancelling(true);
    try {
      await cancelFile(fileLogId, user?.name ?? user?.email ?? '');
      setIsCancelDialogOpen(false);
      // Post-cancel: the file no longer exists — leave its detail route.
      router.push('/dashboard');
    } catch {
      setIsCancelDialogOpen(false);
      setLoadError('We could not cancel this file. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  }, [fileLogId, router, user]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      {isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading file details…
        </p>
      )}

      {/* Failed-fetch error state (NFR5 / NFR8): surfaced with a retry. */}
      {!isLoading && loadError && (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
          <Button type="button" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}

      {/* Not-found state (NFR5): the list resolved but holds no FileLog with this
          id. A user-visible not-found, never a blank page or a crash. */}
      {!isLoading && !loadError && data && !data.fileLog && (
        <Alert variant="destructive" className="mx-auto mt-8 max-w-2xl">
          <AlertTitle>File not found</AlertTitle>
          <AlertDescription>
            We could not find a file with this reference. It may have been
            removed, or the link may be incorrect.
          </AlertDescription>
        </Alert>
      )}

      {/* Loaded file detail. The `fileLogId !== null` guard is a no-op at runtime
          (a found fileLog implies the id resolved) but narrows fileLogId to a
          number for the drill-through href builder — so no `?? 0` placeholder is
          needed and the type stays sound without a suppression. */}
      {!isLoading && !loadError && data?.fileLog && fileLogId !== null && (
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">File detail</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">
                {data.fileLog.CurrentFileName}
              </h1>
              <FileStatusBadge status={data.fileLog.CurrentStatus} />
            </div>
          </header>

          {/* BR4: a Processing / Uploaded file's dataset is not yet final. */}
          {isFileWorkInProgress(data.fileLog.CurrentStatus) && (
            <Alert>
              <AlertTitle>Processing in progress</AlertTitle>
              <AlertDescription>
                This file is still being processed, so its dataset is not yet
                final. The counts below may change as processing completes.
              </AlertDescription>
            </Alert>
          )}

          {/* R12: the four labelled status counts. Total is a static figure; the
              three per-status counts are drillable links to the filtered
              Transactions slice. Each count's label is leading text and its number
              is a styled child of the SAME element, so the deepest element whose
              text matches the label also carries the value (no label-only child to
              shadow it). */}
          <section
            aria-label="File summary"
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            <Card className="p-4">
              <p className="flex flex-col gap-1 text-sm text-muted-foreground">
                Total
                <span className="text-2xl font-semibold text-foreground">
                  {counts.total}
                </span>
              </p>
            </Card>

            {DRILLABLE_STATUSES.map(({ status, key }) => {
              const value = counts[key];
              return (
                <Card key={status} className="p-0">
                  {/* Native anchor (not a Next <Link>): the drill-through URL
                      flips immediately on activation, independent of any
                      client-transition compile/commit timing — the same
                      determinism the Story-1 row drill-through relies on. The
                      label is leading text and the count a styled child of the
                      same anchor, so the anchor's accessible name combines them
                      ("Imported 3") and the count is reachable by label. */}
                  <a
                    href={buildTransactionsHref(fileLogId, status)}
                    className="flex h-full w-full flex-col gap-1 rounded-xl p-4 text-sm text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    {status}
                    <span className="text-2xl font-semibold text-foreground">
                      {value}
                    </span>
                  </a>
                </Card>
              );
            })}
          </section>

          {/* Story 4 — Importer-only lifecycle controls (BR10). Hidden entirely
              from Approvers; the read-only summary above is shared by both roles. */}
          {canUseControls && (
            <section aria-label="File actions" className="flex flex-col gap-4">
              {/* BR7 cancel-blocked banner — shown INSTEAD of the modal when the
                  file has an Approved transaction. role=alert, in-main. */}
              {showBlockedBanner && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>This file cannot be cancelled</AlertTitle>
                  <AlertDescription>
                    This file has at least one approved transaction, so it can
                    no longer be cancelled. Approved transactions must be
                    preserved for the audit trail.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-3">
                {/* R13 / BR5: Retry Validation is offered for a Failed file. */}
                {isFailedStatus(data.fileLog.CurrentStatus) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleRetry()}
                    disabled={isRetrying}
                  >
                    {isRetrying ? 'Retrying validation…' : 'Retry Validation'}
                  </Button>
                )}

                {/* R14 / BR7: Cancel File — opens the destructive confirmation
                    when eligible, or surfaces the blocked banner when not. */}
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancelClick}
                  disabled={isCancelling}
                >
                  Cancel File
                </Button>
              </div>
            </section>
          )}

          {/* BR5 / R15: the invalid-rows grid for a Failed file. Columns are
              resolved dynamically from the columns endpoint (Visible-only,
              declared order); rows are JSON.parsed from the JsonArray STRING. The
              section heading deliberately avoids the substring "Validation Error"
              so it never collides with a column header of that name. */}
          {isFailedStatus(data.fileLog.CurrentStatus) &&
            validationGrid &&
            validationGrid.columns.length > 0 && (
              <section
                aria-label="Rows that failed validation"
                className="flex flex-col gap-3"
              >
                <h2 className="text-lg font-semibold text-foreground">
                  Rows that failed validation
                </h2>
                <p className="text-sm text-muted-foreground">
                  These rows could not be imported. Correct the source data and
                  retry to re-run the import.
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        {validationGrid.columns.map((column) => (
                          <th
                            key={column.Name}
                            scope="col"
                            className="px-4 py-2 text-left font-medium text-foreground"
                          >
                            {column.HeaderText}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validationGrid.rows.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className="border-b border-border last:border-0"
                        >
                          {validationGrid.columns.map((column) => (
                            <td
                              key={column.Name}
                              className="px-4 py-2 text-foreground"
                            >
                              {formatCell(row[column.Name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
        </div>
      )}

      {/* R14 / BR7: destructive Cancel confirmation. Radix AlertDialog gives the
          AlertDialogCancel (safe dismiss) default focus, guarding against an
          accidental delete. The dialog NAMES the file being cancelled. The safe
          action reads "Keep file" and the destructive one "Delete file" so the
          two buttons are unambiguous to both users and automated tests. */}
      <AlertDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently cancel{' '}
              <span className="font-medium text-foreground">
                {data?.fileLog?.CurrentFileName}
              </span>{' '}
              and remove its staged transactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>
              Keep file
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog open until the request settles / navigates.
                event.preventDefault();
                void handleConfirmCancel();
              }}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling…' : 'Delete file'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Renders a validation-error cell value as display text (null/undefined → ''). */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
