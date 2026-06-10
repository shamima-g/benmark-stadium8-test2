/**
 * Submit-enablement predicate for the Upload screen (Epic 2, Story 2 — AC-1).
 *
 * The upload control is enabled ONLY when the Importer has chosen BOTH a File
 * Setting AND a file, and no upload is already in flight. Keeping this as a pure
 * predicate lets the "cannot submit until both are chosen" contract (R3 / AC-1)
 * be asserted in isolation, and prevents a double-submit while a request is in
 * progress.
 */

import type { FileSettingRead } from '@/types/api';
import type { FileSettingOption } from '@/lib/upload/fileSettings';

/**
 * The minimal upload-form state the submit predicate depends on. `setting`
 * accepts either the mapped select option the page tracks or the raw
 * FileSettingRead — the predicate only cares whether a setting has been chosen,
 * not its shape — so unit fixtures can pass either form.
 */
export interface UploadFormState {
  /** The chosen File Setting, or null when none is selected yet. */
  setting: FileSettingOption | FileSettingRead | null;
  /** The chosen file, or null when none has been picked / dropped yet. */
  file: File | null;
  /** True while an upload request is in flight (blocks a second submit). */
  isUploading: boolean;
}

/**
 * True iff a File Setting AND a file are both chosen and no upload is currently
 * in flight. Any missing input — or an in-flight upload — keeps it false.
 */
export function canSubmitUpload(state: UploadFormState): boolean {
  return state.setting !== null && state.file !== null && !state.isUploading;
}
