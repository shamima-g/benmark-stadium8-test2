'use client';

/**
 * Upload a Transaction File (/upload) — Importer-only (Epic 2, Story 2).
 *
 * R3 / R4 / BR10 / project-brief §7 / §9. An Importer selects a File Setting and
 * a file (drag-and-drop dropzone OR the file-picker fallback), and uploads it via
 * POST /v1/files/upload (FileSettingId / FileSettingName / FileName query params,
 * application/octet-stream body). The flow shows an in-progress state, then either
 * an explicit success message referencing the uploaded file (with a link to the
 * new File Log when the success response carries its Id) or an explicit,
 * retryable failure that distinguishes a connectivity problem from a server-side
 * validation/processing failure.
 *
 * Access (AC-4 / BR10): the `(app)` layout gates this route off the user's granted
 * route set (PageRead.Route) — a denied persona (e.g. an Approver) reaching
 * /upload sees the layout's in-page permission-denied banner, not this form. The
 * page therefore renders the upload form for any persona that reaches it (the gate
 * upstream guarantees only granted users do).
 *
 * Data sources (CLAUDE.md §3 — never fetch() directly):
 *   - File Settings: GET /v1/file-settings (FileSettingReadList.FileSettings).
 *   - Upload: POST /v1/files/upload via @/lib/upload/request.uploadFile.
 *
 * Success-feedback reconciliation (§13 spec gap): the upload success
 * DefaultResponse may carry NO created-FileLog Id. The success message therefore
 * references the uploaded file BY NAME (never depending on an Id), and the "view
 * file" link to /files/<Id> renders ONLY when the response carries a positive Id.
 * Once the success state is shown the "Selected file" preview is suppressed so the
 * uploaded file's name is rendered in exactly one place — the success region —
 * keeping that name an unambiguous, findable piece of success feedback. The
 * view-file link is generic copy ("View file log") rather than repeating the file
 * name, so the success name stays single-sourced.
 *
 * Accessible-name note: the File Setting selector is a native <select> (so
 * Playwright's selectOption and the screen-reader combobox role both work),
 * labelled with a proper visible <Label htmlFor> (the established dashboard
 * pattern) so it passes accessibility checks. The file-picker control is labelled
 * "Choose a file" — the two labels are distinct ("File Setting" vs "Choose a
 * file"), so each control is uniquely discoverable by accessible name.
 *
 * Settings-load pattern: the initial GET runs in an effect that mirrors the
 * dashboard's load model — a loading flag is raised, the async fetch resolves the
 * settings or the error, and the flag is lowered in `finally`. State is updated
 * once the awaited work resolves, not as a gratuitous synchronous cascade.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UploadCloudIcon } from 'lucide-react';

import { get } from '@/lib/api/client';
import type {
  DefaultResponse,
  FileSettingRead,
  FileSettingReadList,
} from '@/types/api';
import { useSession } from '@/components/auth/SessionProvider';
import { canSubmitUpload } from '@/lib/upload/canSubmit';
import { uploadFile } from '@/lib/upload/request';
import {
  classifyUploadError,
  type ClassifiedUploadError,
} from '@/lib/upload/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const FILE_SETTINGS_ENDPOINT = '/v1/file-settings';

type UploadStatus =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | { phase: 'success'; fileName: string; fileLogId: number | null }
  | { phase: 'error'; error: ClassifiedUploadError };

export default function UploadPage() {
  const { user } = useSession();

  const [settings, setSettings] = useState<FileSettingRead[]>([]);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [selectedSettingId, setSelectedSettingId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ phase: 'idle' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const list = await get<FileSettingReadList>(FILE_SETTINGS_ENDPOINT);
      setSettings(list?.FileSettings ?? []);
    } catch {
      // NFR5: surface the failure rather than swallow it.
      setSettingsError(
        'We could not load the file settings. Please try again.',
      );
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const selectedSetting =
    settings.find((setting) => String(setting.Id) === selectedSettingId) ??
    null;

  const isUploading = status.phase === 'uploading';
  const isSuccess = status.phase === 'success';
  const canSubmit = canSubmitUpload({
    setting: selectedSetting,
    file,
    isUploading,
  });

  const clearFeedback = useCallback(() => {
    setStatus((prev) =>
      prev.phase === 'success' || prev.phase === 'error'
        ? { phase: 'idle' }
        : prev,
    );
  }, []);

  function handleFileChosen(chosen: File | null) {
    setFile(chosen);
    clearFeedback();
  }

  const performUpload = useCallback(async () => {
    if (!selectedSetting || !file) return;
    setStatus({ phase: 'uploading' });
    try {
      const response: DefaultResponse = await uploadFile({
        setting: selectedSetting,
        file,
        lastChangedUser: user?.name ?? user?.email ?? 'Unknown',
      });
      // §13 spec gap: the success body may carry no created-FileLog Id. Keep the
      // link only when a positive Id is present; the message references the file
      // by name regardless.
      const fileLogId =
        typeof response?.Id === 'number' && response.Id > 0
          ? response.Id
          : null;
      setStatus({ phase: 'success', fileName: file.name, fileLogId });
    } catch (error) {
      setStatus({ phase: 'error', error: classifyUploadError(error) });
    }
  }, [selectedSetting, file, user]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void performUpload();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Upload a transaction file
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a file setting and a transaction file to import.
        </p>
      </header>

      {settingsError && (
        <Card className="mb-6 flex flex-col items-start gap-3 p-6">
          <p role="alert" className="text-sm text-destructive">
            {settingsError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadSettings()}
          >
            Retry
          </Button>
        </Card>
      )}

      <Card className="p-6">
        <form
          className="flex flex-col gap-6"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* File Setting selector — a native <select> so it stays a single
              combobox that drives the FileSettingId / FileSettingName upload
              params. A proper visible <Label htmlFor> supplies its accessible
              name ("File Setting"), distinct from the file-picker's "Choose a
              file" label. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file-setting">File Setting</Label>
            <select
              id="file-setting"
              value={selectedSettingId}
              disabled={settingsLoading}
              onChange={(event) => {
                setSelectedSettingId(event.target.value);
                clearFeedback();
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                {settingsLoading
                  ? 'Loading file settings…'
                  : 'Select a file setting'}
              </option>
              {settings.map((setting) => (
                <option key={setting.Id} value={String(setting.Id)}>
                  {setting.Name}
                </option>
              ))}
            </select>
          </div>

          {/* Drag-and-drop dropzone with a file-picker fallback. The visible
              control is a button (role=button, name includes "drag"/"drop"/
              "choose a file"/"browse") that opens the hidden file input; the
              dropzone also accepts a real drop. The <input type="file"> is the
              picker path Playwright drives via setInputFiles and the label
              ("Choose a file") the integration test selects. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="upload-file">Choose a file</Label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer?.files?.[0] ?? null;
                if (dropped) handleFileChosen(dropped);
              }}
              className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UploadCloudIcon className="size-6" aria-hidden="true" />
              <span className="font-medium text-foreground">
                Drag and drop a file here, or choose a file to browse
              </span>
              <span>CSV transaction files are supported.</span>
            </button>
            <input
              ref={fileInputRef}
              id="upload-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) =>
                handleFileChosen(event.target.files?.[0] ?? null)
              }
            />
            {/* The "Selected file" preview is suppressed once the success state is
                shown, so the uploaded file's name appears in exactly one place —
                the success region — as unambiguous success feedback. */}
            {file && !isSuccess && (
              <p className="text-sm text-foreground">
                Selected file: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {isUploading ? 'Uploading…' : 'Upload file'}
            </Button>
          </div>

          {/* In-progress (AC-2): an explicit upload-in-progress state with a
              progressbar role for assistive tech. */}
          {isUploading && (
            <div
              role="progressbar"
              aria-label="Uploading file"
              aria-busy="true"
              className="text-sm text-muted-foreground"
            >
              Uploading {file?.name}…
            </div>
          )}

          {/* Success (AC-2): explicit success referencing the uploaded file by
              NAME (§13: no Id to lean on). A "view file" link to /files/<Id>
              renders only when the response carried a positive Id; its copy is
              generic ("View file log") so the file name stays single-sourced in
              the success message above it. */}
          {status.phase === 'success' && (
            <div
              role="status"
              className="flex flex-col items-start gap-2 rounded-md border border-input bg-muted/30 p-4 text-sm"
            >
              <p className="font-medium text-foreground">
                <span className="font-semibold">{status.fileName}</span>{' '}
                uploaded successfully.
              </p>
              {status.fileLogId !== null && (
                <Link
                  href={`/files/${status.fileLogId}`}
                  className="text-primary underline underline-offset-4"
                >
                  View file log
                </Link>
              )}
            </div>
          )}

          {/* Failure (AC-2 / AC-3): a retryable error whose copy distinguishes a
              connectivity problem from a server-side validation/processing
              failure. */}
          {status.phase === 'error' && (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
            >
              <p>{status.error.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void performUpload()}
              >
                Retry upload
              </Button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
