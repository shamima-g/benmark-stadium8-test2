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
