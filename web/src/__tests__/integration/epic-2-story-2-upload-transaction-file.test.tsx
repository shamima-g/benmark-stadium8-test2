/**
 * Story Metadata:
 * - Route: /upload
 * - Target File: web/src/app/(app)/upload/page.tsx
 * - Page Action: create_new
 *
 * Epic 2, Story 2: Upload a Transaction File (Importer-only page at /upload).
 *
 * Coverage split (one coverage tag -> one test, per testing-policy.md):
 *   - ALL FOUR acceptance criteria are PLAYWRIGHT-tagged. They are proven
 *     end-to-end against mocked GET /v1/file-settings + POST /v1/files/upload
 *     responses in the companion spec
 *     web/e2e/epic-2-story-2-upload-transaction-file.spec.ts and are NOT
 *     duplicated here as full end-to-end siblings:
 *       AC-1 select-a-setting + choose-a-file (drag/drop or picker) + submit
 *            disabled until BOTH chosen;
 *       AC-2 in-progress -> explicit success (references the created file) OR
 *            explicit failure with a retry action;
 *       AC-3 failure distinguishes connectivity/network from server-side
 *            validation/processing failure;
 *       AC-4 a denied persona (Approver / no Upload access) sees the in-page
 *            permission-denied banner, not the form and not an error page.
 *
 * What this Vitest file DOES cover — the jsdom-observable units that UNDERPIN
 * those Playwright flows and are this story's highest-value regression surface:
 *   1. The submit-enablement PREDICATE (AC-1): canSubmitUpload(state) is true
 *      only when BOTH a File Setting AND a file are selected (and no upload is
 *      already in flight).
 *   2. The File Settings fetch -> select-option MAPPING (FileSettingRead ->
 *      { id, name }), feeding the setting picker.
 *   3. The upload-request CONSTRUCTION (R3): the correct POST /v1/files/upload
 *      with FileSettingId / FileSettingName / FileName query params and an
 *      application/octet-stream body via the shared API client.
 *   4. The error-classification HELPER (AC-3 / R4 / NFR5): a network/connectivity
 *      failure vs a server-side validation/processing failure resolve to
 *      DISTINCT, user-facing messages — mirroring the Epic-1 Story-2 login
 *      credential-vs-connectivity pattern.
 *   5. The route-gating PREDICATE (AC-4 underpin): /upload is in the granted-route
 *      set for an Importer and absent for an Approver. (The end-to-end banner
 *      render is the Playwright AC-4 concern; here we prove the predicate the
 *      `(app)` layout gate keys off.)
 *   6. A focused integration render of the upload page asserting the
 *      jsdom-observable rendering DECISIONS this story owns: submit disabled
 *      until both selections are made, the in-progress -> success transition
 *      referencing the chosen file, and the in-progress -> failure transition
 *      offering a retry, with the connectivity-vs-validation copy distinguished.
 *
 * Source of truth: generated-docs/specs/project-brief.md.
 *   - R3 (§7): Importer uploads via drag-and-drop or file picker; requires
 *     FileSettingId, FileSettingName, FileName params.
 *   - R4 (§7) / §9 File-Upload workflow: success creates a File Log and shows
 *     explicit success; validation failure -> Failed + retry; network failure ->
 *     retryable error.
 *   - BR10 (§8): File Upload is Importer-only; Approvers do not see the control.
 *   - §13: the upload success DefaultResponse does NOT return the new FileLog Id
 *     (documented spec gap) — success feedback must not depend on an Id.
 *   - documentation/transactions-api.yaml: POST /v1/files/upload params + the
 *     application/octet-stream request body; FileSettingRead/FileSettingReadList.
 *
 * EXTRACTED HELPERS the developer must create (pure modules under
 * web/src/lib/upload/ — see the failing imports below). Keeping the predicate /
 * mapping / request-construction / classification logic as pure functions is
 * what lets these units be asserted in jsdom without recreating the Playwright
 * flows:
 *   - web/src/lib/upload/canSubmit.ts   -> canSubmitUpload, UploadFormState
 *   - web/src/lib/upload/fileSettings.ts-> toFileSettingOption, FileSettingOption
 *   - web/src/lib/upload/request.ts     -> uploadFile (calls POST /v1/files/upload
 *                                          with the octet-stream body via the API
 *                                          client) and UPLOAD_ENDPOINT
 *   - web/src/lib/upload/errors.ts      -> classifyUploadError, UploadErrorKind
 *   - web/src/lib/upload/gating.ts      -> canAccessUpload (granted-route predicate)
 * Plus the FileSettingRead / FileSettingReadList types added to
 * web/src/types/api.ts (PascalCase, mirroring transactions-api.yaml).
 *
 * Import note: the page lives under the App-Router `(app)` route group. The `@/`
 * Vite alias does not resolve the parenthesised group segment, so the page is
 * imported via a relative path (the helper modules under @/lib resolve normally).
 *
 * File-picker locator note: the file <input type="file"> is labelled "Choose a
 * file" and the File Setting <select> is labelled "File Setting" — two distinct
 * accessible names. The file-picker tests query the file input by its exact
 * "Choose a file" label scoped to the file <input> so the locator targets ONLY
 * the picker, never the setting select.
 *
 * These tests WILL FAIL until the helpers, types, and page are implemented (TDD red).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Production targets (will fail to import until implemented — TDD red) ---
// Route-group page — relative import (the @/ alias cannot resolve the `(app)` group).
import UploadPage from '../../app/(app)/upload/page';
import { canSubmitUpload } from '@/lib/upload/canSubmit';
import { toFileSettingOption } from '@/lib/upload/fileSettings';
import { uploadFile, UPLOAD_ENDPOINT } from '@/lib/upload/request';
import { classifyUploadError } from '@/lib/upload/errors';
import { canAccessUpload } from '@/lib/upload/gating';

import * as apiClient from '@/lib/api/client';
import { useSession } from '@/components/auth/SessionProvider';
import { useToast } from '@/contexts/ToastContext';
import { createMockAuthUser } from '../helpers/epic-1-mock-data';
import {
  createMockFileSetting,
  createMockFileSettings,
  createMockFileSettingList,
  createMockUploadSuccess,
  createMockUploadFile,
} from '../helpers/epic-2-mock-data';

// Only the external HTTP client is mocked — never the code under test (the page,
// the predicates, the mappers, the request builder). The page fetches the
// settings via GET /v1/file-settings and uploads via POST /v1/files/upload; we
// drive both boundaries here. `uploadFile` itself calls the real `post`, so for
// the request-construction unit we assert against the mocked `post` to prove the
// exact URL/params/body it constructs.
vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));
const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;

// The page reads the signed-in user from the session (Importer identity, used
// for the LastChangedUser audit value and any role display). Mock the hook so
// each test models the persona; the real SessionProvider network path is Epic-1
// baseline coverage and not re-proven here.
vi.mock('@/components/auth/SessionProvider', () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseSession = useSession as ReturnType<typeof vi.fn>;

// Success/failure feedback uses the existing toast system. Spy on showToast so
// the page's feedback decision is observable; the ToastProvider machinery is its
// own concern and not re-proven here.
const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: vi.fn(),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));
const mockUseToast = useToast as ReturnType<typeof vi.fn>;

// Navigation is stubbed so the page renders in jsdom (the success link to the
// File Log surface navigates client-side — its end-to-end target is Playwright).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/upload',
  useSearchParams: () => new URLSearchParams(),
}));

/** A loaded session for the given role (default Importer). */
function sessionFor(roles: string[] = ['Importer']) {
  return {
    user: createMockAuthUser({ roles }),
    error: null,
    isLoading: false,
    refresh: vi.fn(),
    clearSession: vi.fn(),
  };
}

describe('Epic 2, Story 2: Upload a Transaction File', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue(sessionFor(['Importer']));
    mockUseToast.mockReturnValue({
      toasts: [],
      showToast: mockShowToast,
      dismissToast: vi.fn(),
      clearAllToasts: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  // Unit: submit-enablement predicate (underpins AC-1)
  // ===================================================================

  // AC-1 — submit is enabled ONLY when BOTH a File Setting AND a file are chosen,
  // and not while an upload is already in flight. Each missing input independently
  // keeps the predicate false (the "cannot submit until both" contract).
  it('enables submit only when both a File Setting and a file are selected and no upload is in flight', () => {
    const setting = createMockFileSetting({ Id: 1, Name: 'Daily Bank Import' });
    const file = createMockUploadFile();

    // Neither chosen, only one chosen -> cannot submit.
    expect(
      canSubmitUpload({ setting: null, file: null, isUploading: false }),
    ).toBe(false);
    expect(canSubmitUpload({ setting, file: null, isUploading: false })).toBe(
      false,
    );
    expect(canSubmitUpload({ setting: null, file, isUploading: false })).toBe(
      false,
    );

    // Both chosen, idle -> can submit.
    expect(canSubmitUpload({ setting, file, isUploading: false })).toBe(true);

    // Both chosen but an upload is already in flight -> blocked (no double-submit).
    expect(canSubmitUpload({ setting, file, isUploading: true })).toBe(false);
  });

  // ===================================================================
  // Unit: File Settings fetch -> select-option mapping (underpins AC-1)
  // ===================================================================

  // R3 — the setting picker is driven by GET /v1/file-settings; each
  // FileSettingRead maps to a { id, name } option supplying the FileSettingId and
  // FileSettingName the upload request requires.
  it('maps a FileSettingRead onto a select option exposing id and name', () => {
    const options = createMockFileSettings().map(toFileSettingOption);

    expect(options).toEqual([
      { id: 1, name: 'Daily Bank Import' },
      { id: 2, name: 'Monthly Reconciliation' },
      { id: 3, name: 'Ad-hoc Upload' },
    ]);
    // The id stays numeric (it becomes the FileSettingId query param).
    expect(typeof options[0].id).toBe('number');
  });

  // ===================================================================
  // Unit: upload-request construction (underpins AC-2; R3)
  // ===================================================================

  // R3 / transactions-api.yaml — uploadFile must POST to /v1/files/upload with
  // FileSettingId, FileSettingName and FileName as QUERY params and the file as
  // the application/octet-stream request body. We assert against the mocked `post`
  // to prove the exact contract the API client receives.
  it('constructs the POST /v1/files/upload request with the required query params and an octet-stream body', async () => {
    mockPost.mockResolvedValue(createMockUploadSuccess());
    const setting = createMockFileSetting({
      Id: 7,
      Name: 'Monthly Reconciliation',
    });
    const file = createMockUploadFile('june-batch.csv');

    await uploadFile({ setting, file, lastChangedUser: 'Ingrid Mporter' });

    const [endpoint, body, , options] = mockPost.mock.calls[0];

    // Endpoint carries the three required query params (FileSettingId numeric,
    // FileSettingName + FileName from the chosen setting / file).
    expect(endpoint).toBe(UPLOAD_ENDPOINT);
    const passedOptions = (options ?? {}) as Record<string, unknown>;
    const params = (passedOptions.params ?? {}) as Record<string, unknown>;
    expect(params).toMatchObject({
      FileSettingId: 7,
      FileSettingName: 'Monthly Reconciliation',
      FileName: 'june-batch.csv',
    });
    // The request body is the raw file (octet-stream), NOT a JSON-stringified
    // object — the spec body is application/octet-stream binary.
    expect(body).toBe(file);
    // The upload is an authenticated call against the external backend.
    expect(passedOptions.requiresAuth).toBe(true);
  });

  // ===================================================================
  // Unit: error classification — connectivity vs validation (underpins AC-3)
  // ===================================================================

  // AC-3 / R4 / NFR5 — a network/connectivity failure (statusCode 0, the API
  // client's "Network error" shape) and a server-side validation/processing
  // failure (a 4xx/5xx with messages) resolve to DISTINCT user-facing copy and a
  // distinct `kind`. Mirrors the Epic-1 Story-2 credential-vs-connectivity split.
  it('classifies a connectivity failure distinctly from a server-side validation failure', () => {
    // Connectivity: the API client throws statusCode 0 on a network error.
    const connectivity = classifyUploadError({
      message: 'Network error: Unable to connect to the API server',
      statusCode: 0,
      details: ['Please check your internet connection and try again.'],
    });
    expect(connectivity.kind).toBe('connectivity');
    expect(connectivity.message).toMatch(/connect|reach|network|try again/i);
    // Connectivity is retryable.
    expect(connectivity.retryable).toBe(true);

    // Server-side validation/processing failure: a 500 (or 4xx) with messages.
    const validation = classifyUploadError({
      message: 'Internal Server Error: Something went wrong on the server',
      statusCode: 500,
      details: ['Row 3: Amount is not a number'],
    });
    expect(validation.kind).toBe('validation');
    // The two kinds yield DISTINCT copy — a validation failure does not read as a
    // connectivity problem.
    expect(validation.message).not.toBe(connectivity.message);
    expect(validation.message).not.toMatch(/check your internet connection/i);
  });

  // ===================================================================
  // Unit: route-gating predicate (underpins AC-4; BR10)
  // ===================================================================

  // BR10 / §2 — /upload is Importer-only. The gate keys off the granted-route set
  // (PageRead.Route), robust to the §13 caveat that live role names may differ.
  it('grants Upload access to an Importer (route in the granted set) but not an Approver', () => {
    const importer = createMockAuthUser({ roles: ['Importer'] });
    const approver = createMockAuthUser({ roles: ['Approver'] });

    expect(canAccessUpload(importer)).toBe(true);
    expect(canAccessUpload(approver)).toBe(false);
    // A null/unknown user is never granted.
    expect(canAccessUpload(null)).toBe(false);
  });

  // ===================================================================
  // Integration render: submit gating + success / failure feedback
  // ===================================================================

  // AC-1 (jsdom-observable rendering decision) — the submit control is disabled
  // until BOTH a File Setting and a file are chosen. We choose a setting, then a
  // file, asserting the control flips from disabled to enabled.
  it('keeps the upload submit disabled until both a File Setting and a file are chosen', async () => {
    mockGet.mockResolvedValue(createMockFileSettingList());
    const user = userEvent.setup();

    render(<UploadPage />);

    // Settings load -> the picker is populated.
    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /file setting/i }),
      ).toBeInTheDocument();
    });

    const submit = screen.getByRole('button', { name: /upload/i });
    // Nothing chosen yet -> disabled.
    expect(submit).toBeDisabled();

    // Choose a setting only -> still disabled (no file yet).
    await user.selectOptions(
      screen.getByRole('combobox', { name: /file setting/i }),
      '1',
    );
    expect(submit).toBeDisabled();

    // Choose a file via the picker -> now both chosen -> enabled. The locator
    // targets ONLY the file <input>, by its exact "Choose a file" label.
    const fileInput = screen.getByLabelText('Choose a file', {
      selector: 'input[type="file"]',
    });
    await user.upload(fileInput, createMockUploadFile('statements.csv'));

    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
  });

  // AC-2 (jsdom-observable rendering decision) — on a successful upload the page
  // surfaces an explicit success message that references the uploaded file. The
  // success body returns no FileLog Id (§13 spec gap), so the success feedback
  // references the chosen file by NAME, not by a created-record Id.
  it('shows an explicit success message referencing the uploaded file after a successful upload', async () => {
    mockGet.mockResolvedValue(createMockFileSettingList());
    mockPost.mockResolvedValue(createMockUploadSuccess());
    const user = userEvent.setup();

    render(<UploadPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /file setting/i }),
      ).toBeInTheDocument();
    });

    await user.selectOptions(
      screen.getByRole('combobox', { name: /file setting/i }),
      '1',
    );
    await user.upload(
      screen.getByLabelText('Choose a file', {
        selector: 'input[type="file"]',
      }),
      createMockUploadFile('statements.csv'),
    );
    await user.click(screen.getByRole('button', { name: /upload/i }));

    // Success status is announced and references the file by name (no Id to lean on).
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/success|uploaded/i);
    expect(status).toHaveTextContent(/statements\.csv/i);
  });

  // AC-2 + AC-3 (jsdom-observable rendering decision) — a CONNECTIVITY failure
  // surfaces a retryable error distinct from a validation failure. The error
  // region offers a retry action; the copy reads as a connectivity problem.
  it('shows a retryable connectivity-error message (distinct from validation) when the upload network call fails', async () => {
    mockGet.mockResolvedValue(createMockFileSettingList());
    // The API client throws its "Network error" shape (statusCode 0) on a
    // connection failure.
    mockPost.mockRejectedValue({
      message: 'Network error: Unable to connect to the API server',
      statusCode: 0,
      details: ['Please check your internet connection and try again.'],
    });
    const user = userEvent.setup();

    render(<UploadPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /file setting/i }),
      ).toBeInTheDocument();
    });

    await user.selectOptions(
      screen.getByRole('combobox', { name: /file setting/i }),
      '1',
    );
    await user.upload(
      screen.getByLabelText('Choose a file', {
        selector: 'input[type="file"]',
      }),
      createMockUploadFile('statements.csv'),
    );
    await user.click(screen.getByRole('button', { name: /upload/i }));

    const alert = await screen.findByRole('alert');
    // Connectivity copy — names a reachability/network problem, not a server-side
    // validation failure.
    expect(alert).toHaveTextContent(/connect|reach|network|try again/i);
    expect(alert).not.toHaveTextContent(
      /validation|invalid row|processing failed/i,
    );
    // A connectivity failure is retryable — a retry affordance is offered (NFR5).
    expect(
      screen.getByRole('button', { name: /retry|try again/i }),
    ).toBeInTheDocument();
  });

  // NFR1 — the upload page has no accessibility violations once settings load.
  it('has no accessibility violations once the File Settings have loaded', async () => {
    mockGet.mockResolvedValue(createMockFileSettingList());

    const { container } = render(<UploadPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /file setting/i }),
      ).toBeInTheDocument();
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
