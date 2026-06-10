/**
 * Upload error classification for the Upload screen (Epic 2, Story 2 — AC-3 /
 * R4 / NFR5).
 *
 * An upload failure falls into two user-distinguishable kinds, mirroring the
 * Epic-1 Story-2 credential-vs-connectivity split:
 *   - `connectivity` — the request never reached the server (the API client's
 *     "Network error" shape: statusCode 0, or no status at all). The file was
 *     never processed, so the failure is transient and retryable.
 *   - `validation` — the server responded with a 4xx/5xx (e.g. a 422 validation
 *     failure or a 500 processing error). The request reached the backend; the
 *     content or the server rejected it. Still retryable (the user may fix the
 *     file or the server may recover), but the copy must read as a server-side
 *     problem, NOT a connectivity one, so the two failure modes never collapse
 *     into a single generic message.
 *
 * The classifier accepts the loosely-shaped thrown value (an APIError, a native
 * Error, or anything) and always resolves to a definite, distinct result.
 */

/** Machine-readable discriminant for the two upload failure modes. */
export type UploadErrorKind = 'connectivity' | 'validation';

/** The classified, UI-ready outcome of an upload failure. */
export interface ClassifiedUploadError {
  kind: UploadErrorKind;
  /** User-facing copy distinct per kind. */
  message: string;
  /** Whether offering a retry makes sense (true for both kinds here). */
  retryable: boolean;
}

/** Copy shown for a connectivity / network failure. */
const CONNECTIVITY_MESSAGE =
  'We could not reach the server to upload your file. Please check your connection and try again.';

/** Copy shown for a server-side validation / processing failure. */
const VALIDATION_MESSAGE =
  'The server could not process your file. Please review the file and try again.';

/** Narrows an unknown thrown value to a statusCode if it carries one. */
function statusCodeOf(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return undefined;
}

/** Pulls server-supplied detail messages off an APIError-shaped value, if any. */
function detailsOf(error: unknown): string[] {
  if (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    Array.isArray((error as { details: unknown }).details)
  ) {
    return (error as { details: string[] }).details;
  }
  return [];
}

/**
 * Classifies an upload failure into a connectivity vs server-side validation
 * kind with distinct user-facing copy. A statusCode of 0 (or an absent status —
 * the API client never reached the server) is connectivity; any HTTP status the
 * server returned is a server-side validation/processing failure. The validation
 * message surfaces the server's own detail line when one is present, so a row-level
 * reason ("Row 3: Amount is not a number") reaches the user — while still reading
 * as a server-side, not a connectivity, problem.
 */
export function classifyUploadError(error: unknown): ClassifiedUploadError {
  const statusCode = statusCodeOf(error);
  const isConnectivity = statusCode === undefined || statusCode === 0;

  if (isConnectivity) {
    return {
      kind: 'connectivity',
      message: CONNECTIVITY_MESSAGE,
      retryable: true,
    };
  }

  const details = detailsOf(error);
  const detail = details.length > 0 ? ` (${details[0]})` : '';
  return {
    kind: 'validation',
    message: `${VALIDATION_MESSAGE}${detail}`,
    retryable: true,
  };
}
