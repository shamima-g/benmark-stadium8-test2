/**
 * Upload-request construction for the Upload screen (Epic 2, Story 2 — R3).
 *
 * Per documentation/transactions-api.yaml, POST /v1/files/upload carries the
 * FileSettingId, FileSettingName and FileName as QUERY params and the file as an
 * application/octet-stream request BODY. All HTTP goes through the shared API
 * client (CLAUDE.md §3) — never fetch() directly. The body is the raw File, so
 * the client sends it verbatim (not JSON-encoded) with an octet-stream
 * Content-Type, and the call is authenticated (requiresAuth).
 */

import { post } from '@/lib/api/client';
import type { DefaultResponse, FileSettingRead } from '@/types/api';
import type { FileSettingOption } from '@/lib/upload/fileSettings';

/** The upload endpoint path (transactions-api.yaml operationId FilesUpload). */
export const UPLOAD_ENDPOINT = '/v1/files/upload';

/** Inputs the page hands to the upload-request builder. */
export interface UploadFileArgs {
  /** The chosen File Setting (raw read shape or the mapped option). */
  setting: FileSettingRead | FileSettingOption;
  /** The raw file to upload (becomes the octet-stream body). */
  file: File;
  /** The signed-in user, sent as the LastChangedUser audit value. */
  lastChangedUser: string;
}

/** Reads the numeric setting id from either the read shape or the option. */
function settingId(setting: FileSettingRead | FileSettingOption): number {
  return 'Id' in setting ? setting.Id : setting.id;
}

/** Reads the setting name from either the read shape or the option. */
function settingName(setting: FileSettingRead | FileSettingOption): string {
  return 'Name' in setting ? setting.Name : setting.name;
}

/**
 * Uploads a file against the chosen File Setting. Constructs the
 * POST /v1/files/upload request with the three required query params and the raw
 * file as the octet-stream body, and resolves the DefaultResponse the backend
 * returns (its Id, when present, is the new File Log id).
 */
export function uploadFile({
  setting,
  file,
  lastChangedUser,
}: UploadFileArgs): Promise<DefaultResponse> {
  return post<DefaultResponse>(UPLOAD_ENDPOINT, file, lastChangedUser, {
    requiresAuth: true,
    params: {
      FileSettingId: settingId(setting),
      FileSettingName: settingName(setting),
      FileName: file.name,
    },
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}
