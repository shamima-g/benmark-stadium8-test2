/**
 * Story Metadata:
 * - Route: /upload
 * - Target File: web/src/app/(app)/upload/page.tsx
 * - Page Action: create_new
 *
 * E2E spec for Epic 2, Story 2: Upload a Transaction File (Importer-only).
 *
 * Source of truth: generated-docs/specs/project-brief.md (R3, R4, BR10, §2
 * role/permission matrix) and documentation/transactions-api.yaml
 * (FileSettingReadList / FileSettingRead, POST /v1/files/upload,
 * DefaultResponse) + auth-api.yaml (UserInfoRead / PageRead via the BFF proxy).
 *
 * Behaviour under test (the real /upload page):
 *   - AC-1: an Importer can select a File Setting and choose a file via the file
 *           picker (the drag-and-drop dropzone is present), and CANNOT submit
 *           until BOTH a setting and a file are chosen.
 *   - AC-2: submitting shows an upload-in-progress state, then either an explicit
 *           success message referencing the created file (with a link to its
 *           File Log) or an explicit failure message with a retry action.
 *   - AC-3: failure messages distinguish a connectivity/network problem (the
 *           upload request never completes) from a server-side validation /
 *           processing failure (a 4xx/5xx response) — DISTINCT messages, and the
 *           failure surface offers a retry control.
 *   - AC-4: an Approver (any persona without Upload access) reaching /upload sees
 *           the in-page permission-denied banner, NOT the upload form and NOT a
 *           generic error page.
 *
 * Developer contract (confirmed):
 *   - The page reads File Settings via the app's API client
 *     (web/src/lib/api/client.ts -> get('/v1/file-settings')), resolving to
 *     `${NEXT_PUBLIC_API_BASE_URL}/v1/file-settings`.
 *   - Upload posts an octet-stream body to
 *     POST /v1/files/upload?FileSettingId=&FileSettingName=&FileName=
 *     (transactions-api.yaml). The 200 response is a DefaultResponse whose Id is
 *     the new File Log id (used to link to /files/[id]).
 *   - Route access is governed by the Importer's userinfo Pages (BR10 / §2):
 *     the Story-1 fixture grants the Importer /dashboard, /transactions, /upload;
 *     the Approver's Pages EXCLUDE /upload, which drives AC-4.
 *
 * Mocking follows the project default (page-route-with-spec) with one deliberate
 * extension noted here: NFR8 means the transactions backend is NOT serving these
 * paths during the build, so this spec intercepts BOTH the same-origin BFF auth
 * proxy routes (POST /api/auth/login, GET /api/auth/userinfo — built in Epic 1)
 * AND the transactions calls the API client issues to the configured base URL
 * (GET **\/v1/file-settings**, POST **\/v1/files/upload**). All response shapes
 * are derived from the two OpenAPI specs above, so no live BFF or transactions
 * backend is required.
 *
 * Note: Next.js App Router always renders a hidden, body-level
 * `__next-route-announcer__` element that also carries role="alert". A bare
 * getByRole('alert') is therefore ambiguous under Playwright strict mode, so any
 * alert/banner locator below is scoped to the page's main content region.
 *
 * These tests WILL FAIL until the /upload page is implemented (TDD red).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { importerUser, approverUser } from './fixtures/credentials';

const LOGIN_PROXY = '**/api/auth/login';
const USERINFO_PROXY = '**/api/auth/userinfo';
// The API client issues these to the configured base URL; match the path on any
// origin so the intercept holds regardless of how NEXT_PUBLIC_API_BASE_URL
// resolves at runtime.
const FILE_SETTINGS_API = '**/v1/file-settings**';
const FILE_UPLOAD_API = '**/v1/files/upload**';

const DASHBOARD_ROUTE = '/dashboard';
const TRANSACTIONS_ROUTE = '/transactions';
const UPLOAD_ROUTE = '/upload';

type Persona = 'Importer' | 'Approver';

/**
 * A FileSettingReadList body (transactions-api.yaml FileSettingReadList /
 * FileSettingRead, PascalCase). Only the fields the upload page reads are given
 * meaningful values; Id + Name drive the File Setting selector (and feed the
 * FileSettingId / FileSettingName upload query params).
 */
function makeFileSetting(id: number, name: string) {
  return {
    Id: id,
    Name: name,
    SourceId: 1,
    SourceName: 'SFTP',
    TypeId: 1,
    TypeName: 'CSV',
    Direction: 'Inbound',
    StagingSchema: 'staging',
    StagingTable: `stg_${id}`,
    TargetSchema: 'target',
    TargetTable: `tgt_${id}`,
    ProcessDefinitionId: 'pd-1',
    ProcessDefinitionName: 'Transaction Import',
    IsActive: true,
    LastChangedUser: 'system',
    LastChangedDate: '2025-04-30 15:00:00',
  };
}

const fileSettingsList = {
  FileSettings: [
    makeFileSetting(1, 'Daily Transactions'),
    makeFileSetting(2, 'Monthly Reconciliation'),
  ],
};

/** The File Setting name an Importer will pick in the happy-path tests. */
const PICKED_SETTING = fileSettingsList.FileSettings[0];

/**
 * A UserInfoRead body (auth-api.yaml) for the given persona. Both personas can
 * view the Dashboard/Transactions (project-brief §2); only the Importer's Pages
 * include /upload (BR10 / §2: upload is Importer-only). The Approver's Pages
 * EXCLUDE /upload, which is what surfaces the permission-denied banner at AC-4.
 */
function userInfoFor(persona: Persona) {
  const pages =
    persona === 'Importer'
      ? [
          { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
          { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
          { Id: 3, Name: 'Upload', Route: UPLOAD_ROUTE },
        ]
      : [
          { Id: 1, Name: 'Dashboard', Route: DASHBOARD_ROUTE },
          { Id: 2, Name: 'Transactions', Route: TRANSACTIONS_ROUTE },
        ];

  return {
    Id: persona === 'Importer' ? 1 : 2,
    Email: persona === 'Importer' ? importerUser.email : approverUser.email,
    FirstName: persona,
    LastName: 'User',
    RolesString: persona,
    Roles: [
      {
        Id: persona === 'Importer' ? 1 : 2,
        Name: persona,
        Pages: pages,
        LastChangedUser: 'system',
        LastChangedDate: '2025-04-30 15:00:00',
      },
    ],
    Pages: pages,
    LastChangedUser: 'system',
    LastChangedDate: '2025-04-30 15:00:00',
  };
}

/** Stubs the login + userinfo proxy as a signed-in session for the given persona. */
async function mockSignedInAs(page: Page, persona: Persona) {
  await page.route(LOGIN_PROXY, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Messages: ['Login successful'] }),
    }),
  );
  await page.route(USERINFO_PROXY, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(persona)),
    }),
  );
}

/** Stubs GET /v1/file-settings with the supplied FileSettingReadList body. */
async function mockFileSettings(page: Page, body: unknown = fileSettingsList) {
  await page.route(FILE_SETTINGS_API, (route: Route) => {
    // Only answer the GET list call here; let any other method fall through.
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** Drives the login form to sign the given persona in. */
async function signIn(page: Page, persona: Persona) {
  const creds = persona === 'Importer' ? importerUser : approverUser;
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
}

/**
 * Signs the persona in and lands them on /upload with file-settings already
 * mocked. Returns once the upload URL is active. Upload POST mocking is left to
 * each test so success / connectivity / validation paths can diverge.
 */
async function openUploadAs(page: Page, persona: Persona) {
  await mockSignedInAs(page, persona);
  await mockFileSettings(page);
  await signIn(page, persona);
  await page.goto(UPLOAD_ROUTE);
}

/** The page's main content region — anchor for form + banner scoping. */
const main = (page: Page) => page.getByRole('main');

/** The submit / upload control on the form. */
const uploadButton = (page: Page) =>
  main(page).getByRole('button', { name: /upload|submit/i });

/**
 * Chooses a File Setting in the selector. The selector is rendered as a combobox
 * (Shadcn Select / native select); selectOption drives either when the option
 * label matches the File Setting Name.
 */
async function selectFileSetting(page: Page, name: string) {
  await main(page)
    .getByRole('combobox', { name: /file setting|setting/i })
    .selectOption({ label: name });
}

/**
 * Chooses a file through the picker path. setInputFiles targets the hidden
 * <input type="file"> the dropzone wraps (the picker fallback), satisfying
 * AC-1's "choose a file" without simulating a raw DataTransfer drop.
 */
async function pickFile(page: Page, fileName: string) {
  await main(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: fileName,
      mimeType: 'text/csv',
      buffer: Buffer.from('Date,Amount\n2025-04-01,100.00\n'),
    });
}

test.describe('Epic 2, Story 2: Upload a Transaction File', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1: a File Setting + a file are BOTH required before the upload can submit;
  // both the dropzone and the file-picker path are available.
  test('cannot submit until both a File Setting and a file are chosen', async ({
    page,
  }) => {
    await openUploadAs(page, 'Importer');
    await expect(page).toHaveURL(new RegExp(`${UPLOAD_ROUTE}$`));

    // The drag-and-drop dropzone is present (AC-1 "drag-and-drop or the file picker").
    const dropzone = main(page).getByRole('button', {
      name: /drag|drop|choose a file|browse/i,
    });
    await expect(dropzone.first()).toBeVisible();

    // With neither a setting nor a file chosen, the submit control is disabled.
    await expect(uploadButton(page)).toBeDisabled();

    // Choosing ONLY a File Setting is not enough.
    await selectFileSetting(page, PICKED_SETTING.Name);
    await expect(uploadButton(page)).toBeDisabled();

    // Adding a file (the picker path) satisfies the second requirement -> enabled.
    await pickFile(page, 'transactions.csv');
    await expect(uploadButton(page)).toBeEnabled();
  });

  // AC-2: a successful upload shows progress, then an explicit success message
  // referencing the created file with a link to its File Log.
  test('a successful upload shows progress then a success message linking to the new File Log', async ({
    page,
  }) => {
    await openUploadAs(page, 'Importer');

    // The upload POST resolves 200 with a DefaultResponse whose Id is the new
    // File Log id (transactions-api.yaml DefaultResponse). Delay slightly so the
    // in-progress state is observable before success.
    await page.route(FILE_UPLOAD_API, async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 400));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          Id: 4242,
          MessageType: 'Success',
          Messages: ['File uploaded successfully'],
        }),
      });
    });

    await selectFileSetting(page, PICKED_SETTING.Name);
    await pickFile(page, 'transactions.csv');
    await uploadButton(page).click();

    // An upload-in-progress state is surfaced while the request is in flight,
    // via an accessible progressbar (the implementation also shows "Uploading…"
    // on the disabled submit button, so target the progressbar specifically to
    // avoid matching both).
    await expect(main(page).getByRole('progressbar')).toBeVisible();

    // Then an explicit success message referencing the uploaded file.
    const successAlert = main(page)
      .getByRole('status')
      .or(main(page).getByRole('alert'));
    await expect(successAlert).toContainText(/success|uploaded/i);
    await expect(main(page).getByText(/transactions\.csv/i)).toBeVisible();

    // A link to the newly-created File Log (DefaultResponse.Id -> /files/[id]).
    await expect(
      main(page).getByRole('link', {
        name: /file log|view (file|log)|transactions\.csv/i,
      }),
    ).toHaveAttribute('href', /\/files\/4242$/);
  });

  // AC-3: a connectivity failure surfaces a DISTINCT message from a server-side
  // validation/processing failure, and both offer a retry control.
  test('a connectivity failure and a validation failure surface distinct messages, each with retry', async ({
    page,
  }) => {
    await openUploadAs(page, 'Importer');

    // --- Connectivity case: the upload request never completes (network abort). ---
    await page.route(FILE_UPLOAD_API, (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.abort('failed');
    });

    await selectFileSetting(page, PICKED_SETTING.Name);
    await pickFile(page, 'transactions.csv');
    await uploadButton(page).click();

    const failureAlert = main(page).getByRole('alert');
    await expect(failureAlert).toBeVisible();
    // The connectivity message reads as a connection/network problem...
    await expect(failureAlert).toContainText(
      /connect|network|unreachable|try again later/i,
    );
    const connectivityText =
      (await failureAlert.textContent())?.toLowerCase() ?? '';
    // ...and offers a retry affordance.
    await expect(
      main(page).getByRole('button', { name: /retry|try again/i }),
    ).toBeVisible();

    // --- Validation/processing case: the server responds with a 4xx/5xx. ---
    await page.unroute(FILE_UPLOAD_API);
    await page.route(FILE_UPLOAD_API, (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          Id: 0,
          MessageType: 'Error',
          Messages: ['Row 3: Amount column is not a valid number.'],
        }),
      });
    });

    // Retry / re-submit the same selection against the server-failure mock.
    await main(page)
      .getByRole('button', { name: /retry|try again/i })
      .click();

    const serverAlert = main(page).getByRole('alert');
    await expect(serverAlert).toBeVisible();
    const serverText = (await serverAlert.textContent())?.toLowerCase() ?? '';

    // The two failure modes are DISTINCT: the server-side message is not the
    // connectivity message. We assert distinctness both ways so neither path can
    // collapse into a single generic "upload failed" string.
    expect(serverText).not.toEqual(connectivityText);
    await expect(serverAlert).not.toContainText(/network|unreachable/i);
    // The validation/processing failure also offers a retry control.
    await expect(
      main(page).getByRole('button', { name: /retry|try again/i }),
    ).toBeVisible();
  });

  // AC-4: an Approver (no Upload access) reaching /upload sees the in-page
  // permission-denied banner — NOT the upload form and NOT a generic error page.
  test('an Approver reaching /upload sees the permission-denied banner, not the form', async ({
    page,
  }) => {
    await openUploadAs(page, 'Approver');

    // Still signed in — NOT bounced to login (they ARE authenticated).
    await expect(page).not.toHaveURL(/\/login$/);

    // The in-page permission-denied banner is shown and names the missing
    // permission / denied surface (project-brief §2).
    const banner = main(page).getByRole('alert');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/upload|permission/i);

    // The upload form is NOT rendered for the denied persona.
    await expect(
      main(page).getByRole('combobox', { name: /file setting|setting/i }),
    ).toHaveCount(0);
    await expect(uploadButton(page)).toHaveCount(0);

    // It is an in-page banner, not a generic 403 error page.
    await expect(
      page.getByRole('heading', { name: /403|forbidden/i }),
    ).toHaveCount(0);
  });
});
