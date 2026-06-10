/**
 * TransactionRead → table-row mapping, status-badge derivation, and amount
 * formatting for the Transactions table (Epic 3, Story 1).
 *
 * Pure, side-effect-free helpers extracted so the mapping, badge, and formatting
 * logic can be asserted in isolation (Vitest) and reused by the page. They
 * translate the transactions API's PascalCase TransactionRead shape
 * (documentation/transactions-api.yaml / project-brief §6) into the flat row the
 * table renders.
 *
 * Status badges REUSE the shared §11 status mapping: transactionStatusBadge
 * delegates to @/lib/file-logs/mapping.fileStatusBadge so Imported→info,
 * Approved→success, Rejected→error resolve identically across the app — the
 * colour family is defined once, never redefined here.
 *
 * TransactionType is ambiguous (project-brief §13): the OpenAPI example uses the
 * full word "Debit"/"Credit", while requirements-2c.md §6.3 reports single-char
 * "D"/"C" codes from the sample CSV. The mapper normalises BOTH forms to a stable
 * human-readable display label so the table never shows a bare "D".
 */

import type { TransactionRead } from '@/types/api';
import { fileStatusBadge, type StatusBadge } from '@/lib/file-logs/mapping';

/** Re-export the shared badge type so transaction callers have one import surface. */
export type { StatusBadge, StatusBadgeVariant } from '@/lib/file-logs/mapping';

/** The flat row the Transactions table renders for a single TransactionRead. */
export interface TransactionRow {
  /** TransactionRead.Id — stable React key / row identity. */
  id: number;
  /** TransactionRead.Reference → the "Reference" column (e.g. TXN-00001). */
  reference: string;
  /** TransactionRead.TransactionDate (ISO-ish string) → "Transaction Date". */
  transactionDate: string;
  /** TransactionRead.AccountNumber → the "Account" column. */
  account: string;
  /** TransactionRead.Description → the "Description" column. */
  description: string;
  /** TransactionRead.Amount kept as a number for numeric sort + currency format. */
  amount: number;
  /** TransactionRead.Currency → the "Currency" column (e.g. ZAR). */
  currency: string;
  /** Normalised TransactionType display label (Debit/Credit — §13 defensive). */
  transactionType: string;
  /** TransactionRead.Status → the source for the status badge. */
  status: string;
}

/**
 * Normalises the ambiguous TransactionType (project-brief §13) into a stable
 * display label. Accepts the full word ("Debit"/"Credit") or the single-char
 * code ("D"/"C"), case-insensitively. An unrecognised value is passed through
 * verbatim so an unexpected backend code still renders readably rather than
 * being dropped.
 */
function normaliseTransactionType(value: string): string {
  const trimmed = value.trim();
  const key = trimmed.toLowerCase();
  if (key === 'd' || key === 'debit') return 'Debit';
  if (key === 'c' || key === 'credit') return 'Credit';
  return trimmed;
}

/**
 * Resolves a transaction Status string into a labelled status badge, delegating
 * to the shared §11 mapping (fileStatusBadge) so Imported→info, Approved→success,
 * Rejected→error resolve identically to the File Logs surface — the colour family
 * is never redefined here.
 */
export function transactionStatusBadge(status: string): StatusBadge {
  return fileStatusBadge(status);
}

/**
 * Formats a transaction Amount as money for the Amount column: a thousands
 * separator and exactly two decimal places, currency-aware. Uses the Intl
 * currency formatter so the grouping + 2-decimal contract holds regardless of
 * the runtime locale (the exact currency glyph/placement is locale-dependent —
 * the digit grouping and decimals are the load-bearing, user-observable part).
 */
export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    // An unknown/invalid currency code would throw — fall back to a plain
    // 2-decimal grouped number so the amount still reads as money.
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

/** Maps a TransactionRead onto the flat table row (PascalCase → camelCase). */
export function toTransactionRow(tx: TransactionRead): TransactionRow {
  return {
    id: tx.Id,
    reference: tx.Reference,
    transactionDate: tx.TransactionDate,
    account: tx.AccountNumber,
    description: tx.Description,
    amount: tx.Amount,
    currency: tx.Currency,
    transactionType: normaliseTransactionType(tx.TransactionType),
    status: tx.Status,
  };
}
