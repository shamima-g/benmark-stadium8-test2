/**
 * Shared mock-data factories for Epic 3 (Transactions table, filtering, export).
 *
 * Created by Story 1's test-generator. Subsequent stories in this epic import
 * from and extend this file — never duplicate these shapes per test file.
 *
 * The Transaction shapes come from Epic 2's helper (createMockTransaction /
 * createMockTransactionList) — that factory already models the PascalCase
 * documentation/transactions-api.yaml TransactionRead shape this epic consumes,
 * so we re-export it here rather than re-declaring it, and add Epic-3-specific
 * spreads on top.
 *
 * Per project-brief §13 the TransactionType enum is ambiguous: the OpenAPI
 * TransactionRead example uses the full word "Debit", while requirements-2c.md
 * §6.3 reports single-character C/D codes from the sample CSV. The display layer
 * must handle BOTH defensively (see @/lib/transactions/mapping → toTransactionRow).
 * The mixed-type spread below intentionally contains both forms.
 */

import type { TransactionRead, TransactionReadList } from '@/types/api';
import {
  createMockTransaction,
  createMockTransactionList,
} from './epic-2-mock-data';

// Re-export the Epic-2 factories so Epic-3 tests have a single import surface.
export { createMockTransaction, createMockTransactionList };

/**
 * A spread of transactions for the Transactions table that exercises every
 * jsdom-observable behaviour this story owns WITHOUT tripping the 12-row noise
 * ceiling:
 *
 *   - All three statuses (Imported / Approved / Rejected) so the status-badge
 *     mapping renders each variant (project-brief §11).
 *   - Amounts that order numerically, NOT lexically: 75.00 < 480.25 < 1500.50 <
 *     9900.10 (lexically "1500.50" < "480.25" < "75.00" < "9900.10").
 *   - Distinct transaction dates so chronological sort is provable.
 *   - References that sort lexically (TXN-00001 .. TXN-00006).
 *   - TransactionType in BOTH spec forms — full word ("Debit"/"Credit") AND the
 *     single-character codes ("D"/"C") — so the defensive display mapping is
 *     exercised by the row mapper (project-brief §13).
 *
 * Six rows: enough for pagination at page size 5 to span >1 page.
 */
export const createMockTransactions = (): TransactionRead[] => [
  createMockTransaction({
    Id: 5001,
    Reference: 'TXN-00001',
    TransactionDate: '2026-06-01T10:00:00Z',
    AccountNumber: '1001-2034-5567',
    Description: 'Payment for invoice 1234',
    Amount: 1500.5,
    TransactionType: 'Debit',
    Currency: 'ZAR',
    Status: 'Imported',
  }),
  createMockTransaction({
    Id: 5002,
    Reference: 'TXN-00002',
    TransactionDate: '2026-06-03T09:30:00Z',
    AccountNumber: '1001-2034-9988',
    Description: 'Salary deposit',
    Amount: 9900.1,
    TransactionType: 'Credit',
    Currency: 'ZAR',
    Status: 'Approved',
  }),
  createMockTransaction({
    Id: 5003,
    Reference: 'TXN-00003',
    TransactionDate: '2026-06-02T14:15:00Z',
    AccountNumber: '1001-2034-1122',
    Description: 'ATM withdrawal',
    Amount: 480.25,
    // Single-character code form (project-brief §13 ambiguity).
    TransactionType: 'D',
    Currency: 'ZAR',
    Status: 'Rejected',
  }),
  createMockTransaction({
    Id: 5004,
    Reference: 'TXN-00004',
    TransactionDate: '2026-06-05T08:45:00Z',
    AccountNumber: '1001-2034-3344',
    Description: 'Refund credit',
    Amount: 75.0,
    // Single-character code form (project-brief §13 ambiguity).
    TransactionType: 'C',
    Currency: 'ZAR',
    Status: 'Imported',
  }),
  createMockTransaction({
    Id: 5005,
    Reference: 'TXN-00005',
    TransactionDate: '2026-06-04T11:05:00Z',
    AccountNumber: '1001-2034-5566',
    Description: 'Card payment',
    Amount: 320.4,
    TransactionType: 'Debit',
    Currency: 'ZAR',
    Status: 'Approved',
  }),
  createMockTransaction({
    Id: 5006,
    Reference: 'TXN-00006',
    TransactionDate: '2026-06-06T16:20:00Z',
    AccountNumber: '1001-2034-7788',
    Description: 'Interest payment',
    Amount: 12.99,
    TransactionType: 'Credit',
    Currency: 'ZAR',
    Status: 'Imported',
  }),
];

/** The GET /v1/transactions envelope for the Epic-3 spread. */
export const createMockTransactionsList = (
  transactions: TransactionRead[] = createMockTransactions(),
): TransactionReadList => createMockTransactionList(transactions);
