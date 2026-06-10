'use client';

/**
 * File detail (/files/[id]) — minimal placeholder shell (Epic 2, Story 1).
 *
 * Story 1 (File Logs Dashboard) drills each row through to this route (AC-6), so
 * the route must EXIST for that client-side navigation to resolve to a real page
 * rather than aborting on a missing route. This file is intentionally a thin
 * placeholder: the read-only summary + status-count drill-through is built in
 * Epic 2, Story 3 (which owns /files/[id] and REPLACES this placeholder), and the
 * Importer-only lifecycle controls in Story 4. It carries no behaviour of its own
 * beyond confirming the selected file id, so it stays inside the protected (app)
 * shell and reads the id from the route params.
 */

import { use } from 'react';

export default function FileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">File detail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Details for file {id} will appear here.
        </p>
      </header>
    </div>
  );
}
