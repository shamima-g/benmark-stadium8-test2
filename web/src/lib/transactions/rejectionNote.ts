/**
 * Rejection-note validation + normalisation for the Transactions Reject action
 * (Epic 4, Story 2; R10 / BR2).
 *
 * R10 (§7): an Approver may reject an Imported transaction by submitting a
 * non-empty Rejection Note (stored as UserNote), moving Status to Rejected.
 * BR2 (§8, blocker): a non-empty Rejection Note must be provided; the note
 * validates on blur and on submit, and submit is disabled until a note is
 * entered. Whitespace-only input counts as empty (it carries no real content).
 *
 * These pure helpers are extracted so the note-required rule (the gate the modal
 * disables submit off, and validates on blur/submit) and the pre-submit trim can
 * be asserted in isolation (Vitest) and reused by the page.
 */

/**
 * The note-required rule (BR2 / R10): a Rejection Note is valid ONLY when it
 * carries non-whitespace content. An empty string, a whitespace-only string
 * (spaces, tabs, newlines, or any mix), and a missing value (null/undefined) all
 * count as EMPTY — invalid. This is the rule the modal gates submit off and
 * validates on blur and on submit.
 */
export function isRejectionNoteValid(note: string | null | undefined): boolean {
  if (note == null) {
    return false;
  }
  return note.trim().length > 0;
}

/**
 * Trims surrounding whitespace from a Rejection Note before submit so the
 * persisted UserNote carries no leading/trailing padding. Interior whitespace is
 * preserved — the operator's note text is otherwise untouched.
 */
export function normaliseRejectionNote(note: string): string {
  return note.trim();
}
