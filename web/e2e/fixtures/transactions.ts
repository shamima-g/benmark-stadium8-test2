/**
 * Transaction fixtures for E2E specs (Epic 3).
 *
 * Shapes follow documentation/transactions-api.yaml -> TransactionRead /
 * TransactionReadList (PascalCase). GET /v1/transactions returns the full list
 * with NO query params: { Transactions: TransactionRead[] }.
 *
 * The generator below produces a varied list (statuses, amounts, dates,
 * references) large enough that single-column sort and 5/10/20/50 pagination are
 * non-trivial to assert against.
 *
 * Story 2 (filter & search) needs a SECOND, hand-built list where every filter's
 * effect is unambiguous — see FILTER_ROWS / filterTransactionList below. There
 * each Status / FileLogId / date / amount / reference / account value is chosen
 * so a single filter narrows the list to a KNOWN, distinct subset, letting the
 * spec assert exact row counts rather than "fewer rows than before".
 */

/** Status vocabulary the read-only table renders as a coloured/labelled badge. */
export const TRANSACTION_STATUSES = [
  'Imported',
  'Approved',
  'Rejected',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

const CURRENCIES = ['ZAR', 'USD', 'EUR'] as const;
const TRANSACTION_TYPES = ['Debit', 'Credit'] as const;

export interface TransactionRead {
  Id: number;
  FileLogId: number;
  FileName: string;
  Reference: string;
  TransactionDate: string;
  AccountNumber: string;
  Description: string;
  Amount: number;
  TransactionType: string;
  Currency: string;
  Status: string;
  UserNote: string;
  LastChangedUser: string;
  LastChangedDate: string;
}

/**
 * Builds one TransactionRead (transactions-api.yaml, PascalCase). The reference
 * is zero-padded so lexical ordering is predictable; amounts and dates are
 * spread so amount-sort and date-sort produce distinct orderings.
 */
export function makeTransaction(index: number): TransactionRead {
  const seq = String(index).padStart(3, '0');
  const status = TRANSACTION_STATUSES[index % TRANSACTION_STATUSES.length];
  const currency = CURRENCIES[index % CURRENCIES.length];
  const transactionType = TRANSACTION_TYPES[index % TRANSACTION_TYPES.length];
  // Spread dates across days so date sort is meaningful.
  const day = String((index % 28) + 1).padStart(2, '0');
  // Amounts increase but are not monotonic with the reference's lexical order,
  // so sorting by Amount differs from the default (Reference) order.
  const amount = Math.round((((index * 137) % 9000) + 100.5) * 100) / 100;
  return {
    Id: index,
    FileLogId: 1,
    FileName: 'transactions_2025_04_30.csv',
    Reference: `TXN-${seq}`,
    TransactionDate: `2025-04-${day} 15:00:00`,
    AccountNumber: `10000000${seq}`,
    Description: `Payment for invoice ${index}`,
    Amount: amount,
    TransactionType: transactionType,
    Currency: currency,
    Status: status,
    UserNote: '',
    LastChangedUser: 'John Doe',
    LastChangedDate: '2025-04-30 15:00:00',
  };
}

/**
 * A populated TransactionReadList with `count` rows (default 25 — enough that
 * the default page size of 20 leaves a second page, exercising pagination).
 */
export function transactionList(count = 25): {
  Transactions: TransactionRead[];
} {
  return {
    Transactions: Array.from({ length: count }, (_, i) =>
      makeTransaction(i + 1),
    ),
  };
}

/** An empty TransactionReadList — the true zero-data state. */
export const emptyTransactionList: { Transactions: TransactionRead[] } = {
  Transactions: [],
};

// ---------------------------------------------------------------------------
// Story 2 filter fixture — every filter narrows to a KNOWN, distinct subset.
// ---------------------------------------------------------------------------

/**
 * Stable building block for FILTER_ROWS. Only the columns Story-2's filters key
 * off are passed explicitly; everything else gets a sane constant so the row is
 * a valid TransactionRead. The default page size (20) comfortably holds the
 * 8-row fixture, so any "narrowed" assertion is about the filter, not paging.
 *
 * The Description is keyed off the row Id (not the Reference) so the rendered
 * Reference value appears in EXACTLY ONE cell per row. The Transactions table
 * renders both a Reference column and a Description column (R6); echoing the
 * Reference into the Description would make a `getByText(reference)` locator
 * match two cells in the same row and trip Playwright strict mode, so the
 * Description deliberately carries no Reference substring.
 */
function filterRow(
  partial: Pick<
    TransactionRead,
    | 'Id'
    | 'FileLogId'
    | 'Reference'
    | 'TransactionDate'
    | 'AccountNumber'
    | 'Amount'
    | 'Status'
  >,
): TransactionRead {
  return {
    FileName: `file_${partial.FileLogId}.csv`,
    Description: `Payment entry ${partial.Id}`,
    TransactionType: 'Debit',
    Currency: 'ZAR',
    UserNote: '',
    LastChangedUser: 'John Doe',
    LastChangedDate: '2025-04-30 15:00:00',
    ...partial,
  };
}

/**
 * Known constants the Story-2 spec asserts against. Keeping them here (rather
 * than re-deriving in the spec) means a fixture change can't silently drift away
 * from the test's expectations.
 *
 * Layout of FILTER_ROWS (8 rows):
 *   - Status: exactly 2 Approved (TXN-A001, TXN-A002), 4 Imported, 2 Rejected.
 *   - FileLogId: 5 rows in file 1, 3 rows in file 2.
 *   - TransactionDate: spread Jan -> Jun 2025 so a single in-range window
 *     (FILTER_DATE_FROM..FILTER_DATE_TO) captures exactly 3 rows.
 *   - Amount: spread 100 -> 9000 so a single window
 *     (FILTER_AMOUNT_MIN..FILTER_AMOUNT_MAX) captures exactly 2 rows.
 *   - Reference: one row carries the unique token in REF_TOKEN.
 *   - AccountNumber: one (different) row carries the unique token in ACCOUNT_TOKEN.
 */
export const FILTER_STATUS_APPROVED = 'Approved';
export const FILTER_STATUS_APPROVED_COUNT = 2;

/** FileLogId used by the deep-link AC-4; FILE_2_ROW_COUNT rows belong to it. */
export const FILTER_FILE_LOG_ID = 2;
export const FILE_2_ROW_COUNT = 3;

/** Date window (inclusive) that captures exactly 3 FILTER_ROWS. */
export const FILTER_DATE_FROM = '2025-03-01';
export const FILTER_DATE_TO = '2025-05-31';
export const FILTER_DATE_IN_RANGE_COUNT = 3;

/** Amount window (inclusive) that captures exactly 2 FILTER_ROWS. */
export const FILTER_AMOUNT_MIN = 2000;
export const FILTER_AMOUNT_MAX = 4000;
export const FILTER_AMOUNT_IN_RANGE_COUNT = 2;

/** A token present in exactly ONE row's Reference (and in no AccountNumber). */
export const REF_TOKEN = 'ZEBRA';
export const REF_TOKEN_REFERENCE = `TXN-${REF_TOKEN}`;

/** A token present in exactly ONE row's AccountNumber (and in no Reference). */
export const ACCOUNT_TOKEN = '99887766';

/** A token that appears in NO row at all — drives the AC-3 no-results state. */
export const NO_MATCH_TOKEN = 'NONEXISTENT-XYZ';

/**
 * The hand-built filter fixture. Every assertion in the Story-2 spec is derived
 * from the constants above, which in turn describe these rows.
 */
export const FILTER_ROWS: TransactionRead[] = [
  // FileLogId 2 group (3 rows) — the deep-link target file.
  filterRow({
    Id: 101,
    FileLogId: 2,
    Reference: 'TXN-A001',
    TransactionDate: '2025-04-10 15:00:00', // in date window
    AccountNumber: '1000000101',
    Amount: 2500, // in amount window
    Status: 'Approved',
  }),
  filterRow({
    Id: 102,
    FileLogId: 2,
    Reference: 'TXN-A002',
    TransactionDate: '2025-04-20 15:00:00', // in date window
    AccountNumber: '1000000102',
    Amount: 3500, // in amount window
    Status: 'Approved',
  }),
  filterRow({
    Id: 103,
    FileLogId: 2,
    Reference: 'TXN-I001',
    TransactionDate: '2025-06-15 15:00:00', // out of date window
    AccountNumber: '1000000103',
    Amount: 8000, // out of amount window
    Status: 'Imported',
  }),
  // FileLogId 1 group (5 rows).
  filterRow({
    Id: 104,
    FileLogId: 1,
    Reference: 'TXN-I002',
    TransactionDate: '2025-03-05 15:00:00', // in date window
    AccountNumber: '1000000104',
    Amount: 150.5, // out of amount window
    Status: 'Imported',
  }),
  filterRow({
    Id: 105,
    FileLogId: 1,
    Reference: 'TXN-I003',
    TransactionDate: '2025-01-09 15:00:00', // out of date window
    AccountNumber: '1000000105',
    Amount: 6000, // out of amount window
    Status: 'Imported',
  }),
  filterRow({
    Id: 106,
    FileLogId: 1,
    Reference: 'TXN-R001',
    TransactionDate: '2025-02-14 15:00:00', // out of date window
    AccountNumber: '1000000106',
    Amount: 9000, // out of amount window
    Status: 'Rejected',
  }),
  // The unique-Reference-token row.
  filterRow({
    Id: 107,
    FileLogId: 1,
    Reference: REF_TOKEN_REFERENCE, // 'TXN-ZEBRA' — unique Reference token
    TransactionDate: '2025-01-22 15:00:00', // out of date window
    AccountNumber: '1000000107',
    Amount: 500, // out of amount window
    Status: 'Imported',
  }),
  // The unique-AccountNumber-token row.
  filterRow({
    Id: 108,
    FileLogId: 1,
    Reference: 'TXN-R002',
    TransactionDate: '2025-02-28 15:00:00', // out of date window
    AccountNumber: ACCOUNT_TOKEN, // '99887766' — unique Account token
    Amount: 750, // out of amount window
    Status: 'Rejected',
  }),
];

export const FILTER_ROW_COUNT = FILTER_ROWS.length; // 8

/** The Story-2 filter fixture as a TransactionReadList body for page.route(). */
export const filterTransactionList: { Transactions: TransactionRead[] } = {
  Transactions: FILTER_ROWS,
};
