/**
 * FileLog → table-row mapping and status-badge derivation for the File Logs
 * dashboard (Epic 2, Story 1).
 *
 * Pure, side-effect-free helpers extracted so the mapping and badge logic can be
 * asserted in isolation (Vitest) and reused by the dashboard page. They translate
 * the transactions API's PascalCase FileLog shape (project-brief §6 / §13) into
 * the flat row the table renders, and resolve a status string into a labelled,
 * semantically-variant badge per the §11 status colour mapping.
 */

import type { FileLog } from '@/types/api';

/** The semantic badge variant — colour family, never a raw colour value. */
export type StatusBadgeVariant = 'success' | 'error' | 'info' | 'neutral';

/** A status badge: a user-visible label paired with a semantic colour variant. */
export interface StatusBadge {
  label: string;
  variant: StatusBadgeVariant;
}

/** The flat row the File Logs table renders for a single FileLog. */
export interface FileLogRow {
  /** FileLog.Id — used for the row drill-through to /files/[id]. */
  id: number;
  /** FileLog.CurrentFileName → the "File Name" column (project-brief §13). */
  fileName: string;
  /** FileLog.ProcessDate (ISO-ish string) → the "Process Date" column. */
  processDate: string;
  /** FileLog.RecordCount coerced to a number for numeric sort/display. */
  recordCount: number;
  /** FileLog.CurrentStatus → the source for the status badge (project-brief §13). */
  status: string;
}

/**
 * Status → semantic variant mapping (project-brief §11 status colour mapping),
 * widened to cover every status value that appears across BOTH test fixtures
 * (the Vitest fixture: Completed/Failed/Processing/Uploaded; the Playwright spec:
 * Imported/Validated/Approved/Rejected/Failed). Per §11:
 *   - success (green): Completed, Approved, Validated (a passed validation)
 *   - error (red):     Failed, Rejected
 *   - info (blue):     Processing, Imported
 *   - neutral (grey):  Uploaded
 * Keyed case-insensitively so a backend casing drift never silently falls back.
 */
const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  completed: 'success',
  approved: 'success',
  validated: 'success',
  failed: 'error',
  rejected: 'error',
  processing: 'info',
  imported: 'info',
  uploaded: 'neutral',
};

/**
 * Resolves a FileLog CurrentStatus string into a labelled status badge. The
 * label is the status text as supplied (colour is never used alone — NFR1 / §11).
 * An unrecognised status resolves to the neutral variant so an unexpected backend
 * value still renders a readable, labelled badge rather than crashing or showing
 * colour without meaning.
 */
export function fileStatusBadge(status: string): StatusBadge {
  const variant = STATUS_VARIANTS[status.trim().toLowerCase()] ?? 'neutral';
  return { label: status, variant };
}

/**
 * Maps a FileLog onto the flat table row. RecordCount is a string in the spec
 * (§13); it is coerced to a number so the sort comparator orders it numerically
 * (47 < 760 < 3000) rather than lexically. A non-numeric/blank count coerces to 0.
 */
export function toFileLogRow(fileLog: FileLog): FileLogRow {
  const parsed = Number(fileLog.RecordCount);
  return {
    id: fileLog.Id,
    fileName: fileLog.CurrentFileName,
    processDate: fileLog.ProcessDate,
    recordCount: Number.isFinite(parsed) ? parsed : 0,
    status: fileLog.CurrentStatus,
  };
}
