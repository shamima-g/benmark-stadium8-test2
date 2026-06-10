/**
 * Story Metadata:
 * - Route: /files/[id]
 * - Target File: web/src/app/(app)/files/[id]/page.tsx
 * - Page Action: modify_existing — ADD Importer-only lifecycle controls to the
 *   Story-3 file-detail page (layer onto the existing page; do NOT rebuild it).
 *
 * Epic 2, Story 4: File Lifecycle — Validation Errors, Retry & Cancel (Importer).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   ALL FOUR acceptance criteria are PLAYWRIGHT-tagged and proven end-to-end
 *   against mocked responses in the companion spec
 *   web/e2e/epic-2-story-4-file-lifecycle-actions.spec.ts:
 *     - AC-1: Failed file -> invalid rows + column headings + Retry Validation
 *       control; retry re-runs processing and updates the displayed File Status.
 *     - AC-2: Cancel via a confirmation modal that names the file, default focus
 *       on Cancel; confirming removes the file.
 *     - AC-3: at least one Approved transaction -> Cancel blocked, explanatory
 *       banner shown INSTEAD of the modal.
 *     - AC-4: an Approver viewing the same file sees none of these controls.
 *
 * What this VITEST file DOES cover — the jsdom-observable UNITS that underpin the
 * Playwright flows and form this story's highest-value regression surface, plus a
 * handful of focused integration renders:
 *
 *   1. parseValidationErrors(jsonArrayString) — GET /v1/files/validation-errors
 *      returns a ValidationErrors object whose `JsonArray` field is a JSON-array
 *      STRING (transactions-api.yaml components.schemas.ValidationErrors), so the
 *      page MUST JSON.parse it into row objects before rendering. Malformed /
 *      empty input must degrade to an empty row set, never throw.
 *   2. resolveValidationColumns(columnList) — GET /v1/files/validation-errors/
 *      columns returns ColumnList (an array of ColumnDefinition). The grid columns
 *      are built DYNAMICALLY from whatever the endpoint returns (the spec gap: the
 *      error-row keys are not known ahead of time), honouring declared order and
 *      the per-column Visible flag.
 *   3. canCancelFile(transactions, fileLogId) — the BR7 cancel-eligibility
 *      predicate: false when ANY transaction for that file is Approved. Derived
 *      client-side because GET /v1/transactions exposes no FileLogId/Status filter
 *      (the documented Epic 2 spec-gap, reused from Story 3).
 *   4. canUseFileLifecycleControls(roles) — the BR10 Importer-only gating
 *      predicate for Retry/Cancel/validation-error affordances (true for Importer,
 *      false for Approver). (Underpins AC-4 — the Playwright concern.)
 *   5. The retry/cancel REQUEST BUILDERS — retryFileValidation(logId) posts to
 *      /v1/files/retry-validation?LogId=<id>; cancelFile(logId, lastChangedUser)
 *      issues DELETE /v1/files?LogId=<id> carrying the LastChangedUser audit
 *      header. (Note: the API client's del() takes no `params` option, so the
 *      LogId query param is baked into the endpoint string by the builder.)
 *   6. Focused integration renders: controls visible for an Importer on a Failed
 *      file; Retry triggers the request and reflects the updated File Status; the
 *      cancel-blocked path shows the explanatory banner (NOT the modal) when an
 *      Approved transaction exists; axe on the loaded Failed-file detail.
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R13 (§7): Importer may retry validation on a Failed file; status updates.
 *   - R14 (§7): Importer may cancel a file (deactivate), subject to BR7.
 *   - R15 (§7): surface validation errors as invalid rows + column metadata from
 *     /v1/files/validation-errors and /v1/files/validation-errors/columns.
 *   - BR5 (§8): Failed file -> validation-errors view + retry control (Importer).
 *   - BR7 (§8): a file with >=1 Approved transaction blocks Cancel with an
 *     explanatory banner; Cancel is hidden from Approvers entirely.
 *   - BR10 (§8): Upload / Retry Validation / Cancel are Importer-only; Approvers
 *     never see these controls.
 *   - §6 / §13: ValidationErrors.JsonArray is a STRING; ColumnList carries the
 *     column metadata; TransactionRead.Status is 'Imported'|'Approved'|'Rejected'.
 *   - DELETE /v1/files (transactions-api.yaml) requires a LastChangedUser HEADER.
 *
 * EXTRACTED HELPERS the developer must create (pure modules — see the failing
 * imports below). Keeping parse / column-resolve / eligibility / gating / request
 * logic as pure functions is what lets these units be asserted in jsdom without
 * recreating the full Playwright flows:
 *   - web/src/lib/files/validationErrors.ts ->
 *       parseValidationErrors(jsonArrayString: string): ValidationErrorRow[]
 *       resolveValidationColumns(columnList: ColumnDefinition[]): ColumnDefinition[]
 *       (and the ValidationErrorRow shape: Record<string, unknown>)
 *   - web/src/lib/files/cancelEligibility.ts ->
 *       canCancelFile(transactions: TransactionRead[], fileLogId: number): boolean
 *   - web/src/lib/files/lifecycleGating.ts ->
 *       canUseFileLifecycleControls(roles: string[]): boolean
 *   - web/src/lib/files/lifecycleRequests.ts ->
 *       retryFileValidation(logId: number): Promise<DefaultResponse>
 *       cancelFile(logId: number, lastChangedUser: string): Promise<DefaultResponse>
 *
 * NEW TYPES the developer must add to web/src/types/api.ts (mirroring
 * transactions-api.yaml components.schemas.ValidationErrors / ColumnList /
 * ColumnDefinition):
 *   - ColumnDefinition { Name; HeaderText; Visible; CellAlignment; CellDisplay; Classes }
 *   - ColumnList { ColumnList: ColumnDefinition[] }
 *   - ValidationErrors { ValidationErrors: { JsonArray: string } }
 *
 * REUSED from Story 3 (no duplication): the file-detail page + scaffolding,
 * FileStatusBadge, computeStatusCounts, the FileLog / TransactionRead types, and
 * the shared mock factories in epic-2-mock-data (extended by this story with the
 * validation-errors / columns / Failed FileLog / Approved-transaction fixtures).
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/`
 * Vite alias does not resolve the parenthesised group segment, so the page is
 * imported via a relative path (helper modules under @/lib resolve normally).
 *
 * These tests WILL FAIL until the helper modules, the new types, the extended
 * fixtures, and the real lifecycle controls on the page are implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import/behave until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import FileDetailPage from '../../app/(app)/files/[id]/page';
import {
  parseValidationErrors,
  resolveValidationColumns,
} from '@/lib/files/validationErrors';
import type { ColumnDefinition } from '@/types/api';
import { canCancelFile } from '@/lib/files/cancelEligibility';
import { canUseFileLifecycleControls } from '@/lib/files/lifecycleGating';
import { retryFileValidation, cancelFile } from '@/lib/files/lifecycleRequests';

import { get, post, del } from '@/lib/api/client';
import {
  createMockFileLog,
  createMockFileLogList,
  createMockTransaction,
  createMockTransactionList,
  createMockValidationErrors,
  createMockValidationColumns,
} from '../helpers/epic-2-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the helpers). The page fetches the active file-logs list (to locate the FileLog
// by route id), the full transactions list, and — for a Failed file — the
// validation-errors + columns endpoints; the lifecycle controls call post/del.
vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
}));
const mockGet = get as ReturnType<typeof vi.fn>;
const mockPost = post as ReturnType<typeof vi.fn>;
const mockDel = del as ReturnType<typeof vi.fn>;

// The detail page lives inside the protected (app) shell. Mock the session hook so
// the page can render in jsdom. The role drives BR10 gating — each render that
// cares about gating overrides this default via mockUseSession() below.
const mockUser: {
  email: string;
  name: string;
  roles: string[];
  routes: string[];
} = {
  email: 'importer@example.com',
  name: 'Ingrid Mporter',
  roles: ['Importer'],
  routes: ['/dashboard', '/upload', '/files'],
};
vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: () => ({
    user: mockUser,
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Stub Next navigation so the page renders in jsdom (post-cancel navigation away
// is the Playwright AC-2 concern; here we only need the hooks to resolve).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/files/1002',
  useSearchParams: () => new URLSearchParams(),
}));

/** Renders the page for a given route id (read via use(params) in the page). */
function renderDetail(id: string) {
  return render(<FileDetailPage params={Promise.resolve({ id })} />);
}

/**
 * Wires mockGet so a Failed FileLog (id 1002) resolves with the supplied
 * transactions, validation-error rows, and columns. The page locates the file in
 * the active file-logs list, fetches the full transactions list, and (because the
 * file is Failed) fetches the validation-errors + columns endpoints.
 */
function wireFailedFile(
  transactions = [
    createMockTransaction({ Id: 5101, FileLogId: 1002, Status: 'Imported' }),
  ],
) {
  mockGet.mockImplementation((endpoint: string) => {
    if (endpoint.includes('/v1/files/validation-errors/columns')) {
      return Promise.resolve(createMockValidationColumns());
    }
    if (endpoint.includes('/v1/files/validation-errors')) {
      return Promise.resolve(createMockValidationErrors());
    }
    if (endpoint.includes('/v1/file-logs')) {
      return Promise.resolve(
        createMockFileLogList([
          createMockFileLog({
            Id: 1002,
            CurrentFileName: 'bravo-2026-06-02.csv',
            CurrentStatus: 'Failed',
          }),
        ]),
      );
    }
    return Promise.resolve(createMockTransactionList(transactions));
  });
}

describe('Epic 2, Story 4: File Lifecycle — Validation Errors, Retry & Cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.roles = ['Importer'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // Unit: parseValidationErrors — JsonArray STRING -> row objects (R15 / §13).
  // ===================================================================

  // R15 / §13 — GET /v1/files/validation-errors returns ValidationErrors whose
  // JsonArray field is a JSON-array STRING; the page must JSON.parse it into row
  // objects (each row's keys vary by table — the dynamic-columns spec gap).
  it('parses the validation-errors JsonArray string into row objects', () => {
    const jsonArray = JSON.stringify([
      { Id: 23, Name: 'Bison', Age: '19', Species: 'Bison bison' },
      { Id: 24, Name: 'Zebra', Age: '7', Species: 'Equus quagga' },
    ]);

    const rows = parseValidationErrors(jsonArray);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Id: 23, Name: 'Bison', Age: '19' });
    expect(rows[1]).toMatchObject({ Name: 'Zebra', Species: 'Equus quagga' });
  });

  // R15 / NFR5 — a malformed or empty JsonArray must degrade to an empty row set,
  // never throw (the backend is currently unreliable per §13/NFR8), so the view
  // can render an empty/error state rather than crashing the page.
  it('returns an empty row set for a malformed or empty JsonArray string', () => {
    expect(parseValidationErrors('')).toEqual([]);
    expect(parseValidationErrors('not-json')).toEqual([]);
    expect(parseValidationErrors('{}')).toEqual([]);
  });

  // ===================================================================
  // Unit: resolveValidationColumns — dynamic grid columns (R15 spec gap).
  // ===================================================================

  // R15 — the grid columns are built DYNAMICALLY from whatever ColumnList the
  // columns endpoint returns, in declared order, honouring the per-column Visible
  // flag (a Visible:false column is dropped from the rendered grid).
  it('builds visible grid columns from ColumnList in declared order', () => {
    const columns = resolveValidationColumns([
      {
        Name: 'Name',
        HeaderText: 'User Name',
        Visible: true,
        CellAlignment: 'left',
        CellDisplay: 'text',
        Classes: 'col-name',
      },
      {
        Name: 'Internal',
        HeaderText: 'Internal',
        Visible: false,
        CellAlignment: 'left',
        CellDisplay: 'text',
        Classes: 'col-internal',
      },
      {
        Name: 'Age',
        HeaderText: 'Age',
        Visible: true,
        CellAlignment: 'right',
        CellDisplay: 'number',
        Classes: 'col-age',
      },
    ]);

    expect(columns.map((c: ColumnDefinition) => c.HeaderText)).toEqual([
      'User Name',
      'Age',
    ]);
  });

  // ===================================================================
  // Unit: canCancelFile — BR7 cancel-eligibility predicate.
  // ===================================================================

  // BR7 — Cancel is blocked when ANY transaction for the file is Approved; with no
  // Approved transaction for that file, Cancel is permitted.
  it('blocks cancel when the file has an Approved transaction and allows it otherwise', () => {
    const withApproved = [
      createMockTransaction({ Id: 5101, FileLogId: 1002, Status: 'Imported' }),
      createMockTransaction({ Id: 5102, FileLogId: 1002, Status: 'Approved' }),
    ];
    const withoutApproved = [
      createMockTransaction({ Id: 5103, FileLogId: 1002, Status: 'Imported' }),
      createMockTransaction({ Id: 5104, FileLogId: 1002, Status: 'Rejected' }),
    ];

    expect(canCancelFile(withApproved, 1002)).toBe(false);
    expect(canCancelFile(withoutApproved, 1002)).toBe(true);
  });

  // BR7 / §6 — eligibility is derived ONLY from transactions owning the file under
  // test: an Approved transaction belonging to a DIFFERENT file must not block
  // cancel (GET /v1/transactions can't filter server-side — the Epic 2 spec gap).
  it('ignores Approved transactions that belong to a different file', () => {
    const mixed = [
      createMockTransaction({ Id: 5105, FileLogId: 1002, Status: 'Imported' }),
      // Approved, but owned by file 2002 — must NOT block cancel of file 1002.
      createMockTransaction({ Id: 6101, FileLogId: 2002, Status: 'Approved' }),
    ];

    expect(canCancelFile(mixed, 1002)).toBe(true);
  });

  // ===================================================================
  // Unit: canUseFileLifecycleControls — BR10 Importer-only gating (underpins AC-4).
  // ===================================================================

  // BR10 — Retry Validation / Cancel / validation-error affordances are
  // Importer-only; an Approver is never granted them (the AC-4 contract, proven
  // end-to-end in Playwright; pinned here as the pure gating unit).
  it('grants lifecycle controls to an Importer and denies them to an Approver', () => {
    expect(canUseFileLifecycleControls(['Importer'])).toBe(true);
    expect(canUseFileLifecycleControls(['Approver'])).toBe(false);
    expect(canUseFileLifecycleControls([])).toBe(false);
  });

  // ===================================================================
  // Unit: request builders — retry (POST) + cancel (DELETE w/ audit header).
  // ===================================================================

  // R13 — retry posts to /v1/files/retry-validation with the file's LogId as a
  // query param and returns the DefaultResponse the caller uses to reflect the
  // updated File Status.
  it('retryFileValidation posts to retry-validation with the LogId query param', async () => {
    mockPost.mockResolvedValue({
      Id: 0,
      MessageType: 'SUCCESS',
      Messages: ['Validation retried'],
    });

    await retryFileValidation(1002);

    const [endpoint] = mockPost.mock.calls[0];
    expect(endpoint).toContain('/v1/files/retry-validation');
    expect(endpoint).toContain('LogId=1002');
  });

  // R14 / DELETE /v1/files contract — cancel issues a DELETE for the file's LogId
  // and MUST carry the acting user in the LastChangedUser audit header (the second
  // del() argument is the lastChangedUser the client maps to that header).
  it('cancelFile issues a DELETE for the LogId carrying the LastChangedUser', async () => {
    mockDel.mockResolvedValue({
      Id: 0,
      MessageType: 'SUCCESS',
      Messages: ['File cancelled'],
    });

    await cancelFile(1002, 'Ingrid Mporter');

    const [endpoint, lastChangedUser] = mockDel.mock.calls[0];
    expect(endpoint).toContain('/v1/files');
    expect(endpoint).toContain('LogId=1002');
    expect(lastChangedUser).toBe('Ingrid Mporter');
  });

  // ===================================================================
  // Integration: Failed-file detail renders the validation view + controls (BR5).
  // ===================================================================

  // BR5 / R15 — an Importer viewing a Failed file sees the invalid rows WITH their
  // resolved column headings and a Retry Validation control. Scoped to the
  // validation-errors region so the heading match can't bleed into the summary.
  it('shows the validation rows with column headings and a Retry control for an Importer on a Failed file', async () => {
    wireFailedFile();

    renderDetail('1002');

    const retryButton = await screen.findByRole('button', {
      name: /retry validation/i,
    });
    expect(retryButton).toBeInTheDocument();

    // Column metadata is rendered as real table column headers (the fixture's
    // ColumnList declares "Animal Name" / "Age" / "Species" as visible columns).
    expect(
      screen.getByRole('columnheader', { name: /animal name/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /species/i }),
    ).toBeInTheDocument();
    // And at least one parsed invalid row is rendered.
    expect(screen.getByRole('cell', { name: /bison/i })).toBeInTheDocument();
  });

  // ===================================================================
  // Integration: Retry triggers the request and reflects the updated status (R13).
  // ===================================================================

  // R13 / AC-1 unit — clicking Retry Validation calls POST /v1/files/retry-
  // validation; on success the page re-fetches and reflects the updated File
  // Status (the Failed file's status flips to Completed once retry succeeds).
  it('reflects the updated File Status after a successful Retry Validation', async () => {
    const user = userEvent.setup();
    wireFailedFile();
    mockPost.mockResolvedValue({
      Id: 0,
      MessageType: 'SUCCESS',
      Messages: ['Validation retried'],
    });

    renderDetail('1002');

    const retryButton = await screen.findByRole('button', {
      name: /retry validation/i,
    });

    // After retry, the file-logs re-fetch returns the same file now Completed.
    mockGet.mockImplementation((endpoint: string) => {
      if (endpoint.includes('/v1/files/validation-errors/columns')) {
        return Promise.resolve(createMockValidationColumns());
      }
      if (endpoint.includes('/v1/files/validation-errors')) {
        return Promise.resolve(createMockValidationErrors());
      }
      if (endpoint.includes('/v1/file-logs')) {
        return Promise.resolve(
          createMockFileLogList([
            createMockFileLog({
              Id: 1002,
              CurrentFileName: 'bravo-2026-06-02.csv',
              CurrentStatus: 'Completed',
            }),
          ]),
        );
      }
      return Promise.resolve(createMockTransactionList());
    });

    await user.click(retryButton);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });
  });

  // ===================================================================
  // Integration: BR7 cancel-blocked path shows the banner, NOT the modal.
  // ===================================================================

  // BR7 / AC-3 unit — when the file has an Approved transaction, triggering Cancel
  // surfaces an explanatory banner (role="alert") INSTEAD of the confirmation
  // modal (role="alertdialog"); no destructive dialog is ever opened.
  it('shows the explanatory banner instead of the cancel modal when an Approved transaction exists', async () => {
    const user = userEvent.setup();
    wireFailedFile([
      createMockTransaction({ Id: 5201, FileLogId: 1002, Status: 'Imported' }),
      createMockTransaction({ Id: 5202, FileLogId: 1002, Status: 'Approved' }),
    ]);

    renderDetail('1002');

    const cancelButton = await screen.findByRole('button', {
      name: /cancel file/i,
    });
    await user.click(cancelButton);

    const banner = await screen.findByRole('alert');
    expect(within(banner).getByText(/approved/i)).toBeInTheDocument();
    // The destructive confirmation modal must NOT open on the blocked path.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  // ===================================================================
  // Accessibility — the loaded Failed-file detail has no axe violations (NFR1).
  // ===================================================================

  // NFR1 — the Failed-file detail (validation grid + Retry/Cancel controls) is
  // accessible once loaded.
  it('has no accessibility violations on the loaded Failed-file detail', async () => {
    wireFailedFile();

    const { container } = renderDetail('1002');

    await screen.findByRole('button', { name: /retry validation/i });
    expect(await axe(container)).toHaveNoViolations();
  });
});
