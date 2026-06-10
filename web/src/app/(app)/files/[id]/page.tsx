'use client';

/**
 * File detail (/files/[id]) — read-only Summary & Status-Count Drill-Through
 * (Epic 2, Story 3; R12 / BR4).
 *
 * Replaces the Epic-2 Story-1 placeholder at this path (CLAUDE.md §7: the brief
 * is the source of truth; the placeholder is replaced, not extended). The page
 * is the shared file-detail surface readable by BOTH the Importer and the
 * Approver (project-brief §2). Story 4's Importer-only lifecycle controls attach
 * to this shell later.
 *
 * Route params: Next 16 passes `params` as a Promise. It is resolved in an
 * effect (rather than via React's `use()`) so the page renders its loading state
 * SYNCHRONOUSLY on first paint — `use()` suspends the whole subtree until the
 * promise settles, which would swallow the loading affordance the async-UX
 * contract (NFR5) requires. Resolving in an effect keeps the loading state
 * observable and the data fetch fires once the id is known.
 *
 * Data (R12 / §4 / Epic 2 spec-gap):
 *   - The transactions API exposes no single-file GET, so the page fetches the
 *     active File Logs list (GET /v1/file-logs?IsActive=Yes) and SELECTS the
 *     FileLog whose Id matches the route id — identical to the Story-1 dashboard
 *     contract. An id with no matching FileLog is treated as not-found.
 *   - It fetches the full transactions list (GET /v1/transactions — no FileLogId
 *     / Status filter params, the documented spec gap) and tallies the status
 *     counts client-side via computeStatusCounts (filter by FileLogId).
 *   All calls go through the shared API client (CLAUDE.md §3).
 *
 * Render:
 *   - Loading (NFR5): a role=status loading state while the id resolves or either
 *     fetch is in flight; the summary never renders before data arrives.
 *   - Error / not-found (NFR5 / NFR8): a role=alert error state — surfaced, never
 *     swallowed — for a failed fetch OR an unknown file id, with a retry
 *     affordance for the failed-fetch case.
 *   - Header: the file's CurrentFileName + a FileStatusBadge (reused from Story 1,
 *     §11 status colour mapping — colour always paired with the status label).
 *   - Summary panel (R12): a role=region with four labelled counts — Total,
 *     Imported, Approved, Rejected — whose numbers derive from THIS file's
 *     transactions. The three per-status counts are drillable: each is a NATIVE
 *     anchor to /transactions?fileLogId=<id>&status=<Status> (buildTransactionsHref),
 *     mirroring the Story-1 native-anchor pattern so the URL flips immediately on
 *     activation independent of any client-transition compile/commit timing. Total
 *     is a static figure (no filtered slice to drill into). Each count's label is
 *     leading text and its number a styled child of the SAME element, so the
 *     deepest element whose text matches the label also carries the value.
 *   - BR4 work-in-progress banner: when the file's status is Processing or
 *     Uploaded (isFileWorkInProgress), an in-main role=alert banner stating the
 *     dataset is not yet final.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getActiveFileLogs } from '@/lib/api/file-logs';
import { getTransactions } from '@/lib/api/transactions';
import { FileStatusBadge } from '@/components/file-logs/FileStatusBadge';
import {
  buildTransactionsHref,
  computeStatusCounts,
  isFileWorkInProgress,
  type DrillableStatus,
  type StatusCounts,
} from '@/lib/files/statusCounts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { FileLog, TransactionRead } from '@/types/api';

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

interface FileDetailData {
  fileLog: FileLog | null;
  transactions: TransactionRead[];
}

export default function FileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [fileLogId, setFileLogId] = useState<number | null>(null);
  const [data, setData] = useState<FileDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tracks the latest in-flight load so a settled-but-stale fetch never writes
  // its result. Bumped on each load() invocation; only the run whose token still
  // matches the current ref commits its state. Mirrors the `active`-flag guard
  // the params-resolution effect uses, applied to the data fetch for parity.
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
        </div>
      )}
    </div>
  );
}
