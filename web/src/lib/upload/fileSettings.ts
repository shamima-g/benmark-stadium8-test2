/**
 * File Settings mapping for the Upload screen (Epic 2, Story 2 — R3).
 *
 * The setting picker is driven by GET /v1/file-settings (FileSettingReadList).
 * Each FileSettingRead is mapped to a compact `{ id, name }` option that supplies
 * the FileSettingId / FileSettingName the upload request requires. `id` stays
 * numeric because it becomes the FileSettingId query param.
 */

import type { FileSettingRead } from '@/types/api';

/** A File Setting reduced to the fields the upload selector and request need. */
export interface FileSettingOption {
  id: number;
  name: string;
}

/** Maps a FileSettingRead onto the select option exposing its id and name. */
export function toFileSettingOption(
  setting: FileSettingRead,
): FileSettingOption {
  return { id: setting.Id, name: setting.Name };
}
