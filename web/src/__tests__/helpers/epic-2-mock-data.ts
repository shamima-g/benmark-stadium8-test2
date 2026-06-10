/**
 * Shared mock-data factories for Epic 2 (File Management).
 *
 * Created by Story 1's test-generator. Subsequent stories in this epic import
 * from and extend this file — never duplicate these shapes per test file.
 *
 * Shapes are derived from documentation/transactions-api.yaml
 * (components.schemas.FileLog / FileLogList). The transactions API returns
 * PascalCase fields. Per project-brief §6 / §13:
 *   - FileLog.CurrentFileName carries the file name (mapped to the "File Name"
 *     display column — NOT a `FileName` field).
 *   - FileLog.RecordCount is typed `string` in the spec (e.g. "1240"), not a
 *     number — the row mapper is responsible for coercing it for sort/display.
 *   - FileLog.CurrentStatus is the resolved status-enum string the badge is
 *     keyed off (project-brief §13 confirms CurrentStatus, not the derived
 *     LastExecutedActivityName, is the badge source).
 *
 * The FileLog / FileLogList types are imported from @/types/api (the production
 * shape the developer must add — see the test file's extracted-helper notes)
 * so the factory always models exactly what the dashboard consumes.
 */

import type { FileLog, FileLogList } from '@/types/api';

/**
 * A single FileLog as the BFF / transactions API returns it (PascalCase).
 * Default models a Completed, active file with a realistic ZA-style payload.
 * Override any field for status / date / count variations.
 */
export const createMockFileLog = (
  overrides: Partial<FileLog> = {},
): FileLog => ({
  Id: 1001,
  ProcessDate: '2026-06-01T09:15:00Z',
  SettingId: 1,
  SettingName: 'Daily Bank Import',
  ProcessInstanceId: 'pi-1001',
  CurrentFolder: '/inbound',
  CurrentFileName: 'bank-statements-2026-06-01.csv',
  FileHash: 'hash-1001',
  RecordCount: '1240',
  Direction: 'Inbound',
  CurrentStatus: 'Completed',
  LastExecutedActivityName: 'CompleteImport',
  ProcessDefinitionId: 'pd-1',
  ProcessName: 'BankImport',
  IsActive: true,
  BulkErrorFile: '',
  HasBulkErrorFile: 'No',
  ...overrides,
});

/**
 * A spread of FileLogs across the distinct statuses the badge must render
 * (project-brief §11 status mapping) and with varied dates / record counts so
 * sort, filter, and pagination units have meaningful data to operate on.
 *
 * Eight rows: enough to exercise pagination at page sizes 5 (>1 page) without
 * tripping the 12-row noise threshold.
 */
export const createMockFileLogs = (): FileLog[] => [
  createMockFileLog({
    Id: 1001,
    CurrentFileName: 'alpha-2026-06-01.csv',
    ProcessDate: '2026-06-01T09:15:00Z',
    RecordCount: '1240',
    CurrentStatus: 'Completed',
  }),
  createMockFileLog({
    Id: 1002,
    CurrentFileName: 'bravo-2026-06-02.csv',
    ProcessDate: '2026-06-02T11:30:00Z',
    RecordCount: '85',
    CurrentStatus: 'Failed',
  }),
  createMockFileLog({
    Id: 1003,
    CurrentFileName: 'charlie-2026-06-03.csv',
    ProcessDate: '2026-06-03T08:00:00Z',
    RecordCount: '512',
    CurrentStatus: 'Processing',
  }),
  createMockFileLog({
    Id: 1004,
    CurrentFileName: 'delta-2026-06-04.csv',
    ProcessDate: '2026-06-04T14:45:00Z',
    RecordCount: '9',
    CurrentStatus: 'Uploaded',
  }),
  createMockFileLog({
    Id: 1005,
    CurrentFileName: 'echo-2026-06-05.csv',
    ProcessDate: '2026-06-05T10:10:00Z',
    RecordCount: '3000',
    CurrentStatus: 'Completed',
  }),
  createMockFileLog({
    Id: 1006,
    CurrentFileName: 'foxtrot-2026-06-06.csv',
    ProcessDate: '2026-06-06T16:20:00Z',
    RecordCount: '47',
    CurrentStatus: 'Failed',
  }),
  createMockFileLog({
    Id: 1007,
    CurrentFileName: 'golf-2026-06-07.csv',
    ProcessDate: '2026-06-07T07:05:00Z',
    RecordCount: '760',
    CurrentStatus: 'Completed',
  }),
  createMockFileLog({
    Id: 1008,
    CurrentFileName: 'hotel-2026-06-08.csv',
    ProcessDate: '2026-06-08T13:55:00Z',
    RecordCount: '120',
    CurrentStatus: 'Processing',
  }),
];

/** The GET /v1/file-logs?IsActive=Yes envelope ({ FileLog: FileLog[] }). */
export const createMockFileLogList = (
  fileLogs: FileLog[] = createMockFileLogs(),
): FileLogList => ({
  FileLog: fileLogs,
});

/**
 * ---------------------------------------------------------------------------
 * Story 2 (Upload a Transaction File) fixtures.
 *
 * Shapes mirror documentation/transactions-api.yaml
 * (components.schemas.FileSettingRead / FileSettingReadList) and the
 * POST /v1/files/upload contract. Per the spec the upload success response is a
 * DefaultResponse that does NOT carry the newly-created FileLog Id (a documented
 * spec gap — project-brief §13 / story summary); the success fixture below
 * models that absence deliberately so the success-feedback unit cannot lean on
 * an Id the backend never returns.
 *
 * The FileSettingRead / FileSettingReadList / DefaultResponse types are imported
 * from @/types/api (the production shapes — FileSettingRead/FileSettingReadList
 * are added by this story's developer) so the factories always model exactly
 * what the upload page consumes.
 * ---------------------------------------------------------------------------
 */

import type {
  DefaultResponse,
  FileSettingRead,
  FileSettingReadList,
} from '@/types/api';

/**
 * A single FileSetting as GET /v1/file-settings returns it (PascalCase).
 * Default models an active inbound bank-import setting. Override any field for
 * variations (inactive settings, alternate names, etc.).
 */
export const createMockFileSetting = (
  overrides: Partial<FileSettingRead> = {},
): FileSettingRead => ({
  Id: 1,
  Name: 'Daily Bank Import',
  SourceId: 1,
  SourceName: 'SFTP',
  TypeId: 1,
  TypeName: 'CSV',
  Direction: 'Inbound',
  StagingSchema: 'staging',
  StagingTable: 'bank_tx',
  TargetSchema: 'dbo',
  TargetTable: 'Transactions',
  ProcessDefinitionId: 'pd-1',
  ProcessDefinitionName: 'BankImport',
  IsActive: true,
  LastChangedUser: 'System',
  LastChangedDate: '2026-06-01 09:15:00',
  ...overrides,
});

/** A spread of File Settings so the select-options mapping has >1 entry. */
export const createMockFileSettings = (): FileSettingRead[] => [
  createMockFileSetting({ Id: 1, Name: 'Daily Bank Import' }),
  createMockFileSetting({ Id: 2, Name: 'Monthly Reconciliation' }),
  createMockFileSetting({ Id: 3, Name: 'Ad-hoc Upload' }),
];

/** The GET /v1/file-settings envelope ({ FileSettings: FileSettingRead[] }). */
export const createMockFileSettingList = (
  fileSettings: FileSettingRead[] = createMockFileSettings(),
): FileSettingReadList => ({
  FileSettings: fileSettings,
});

/**
 * A successful POST /v1/files/upload response. Per the spec the success body is
 * a DefaultResponse; it carries NO created-FileLog Id (the documented spec gap),
 * so callers cannot link straight to a specific File Log by Id from this body.
 * Id is set to 0 here to model "no meaningful Id returned".
 */
export const createMockUploadSuccess = (
  overrides: Partial<DefaultResponse> = {},
): DefaultResponse => ({
  Id: 0,
  MessageType: 'SUCCESS',
  Messages: ['File uploaded successfully'],
  ...overrides,
});

/** A File object usable as the octet-stream upload body in jsdom. */
export const createMockUploadFile = (
  name = 'transactions-2026-06-10.csv',
  content = 'Reference,Amount\nTXN-00001,1500.50\n',
): File => new File([content], name, { type: 'text/csv' });

/**
 * ---------------------------------------------------------------------------
 * Story 3 (File Detail — Summary & Status-Count Drill-Through) fixtures.
 *
 * Shapes mirror documentation/transactions-api.yaml
 * (components.schemas.TransactionRead / TransactionReadList). Per the Epic 2
 * spec-gap note (epic overview §"Spec gaps") and the story summary, GET
 * /v1/transactions exposes NO FileLogId / Status query params, so the file-
 * detail page fetches the full transactions list and filters by FileLogId
 * client-side before tallying the Total / Imported / Approved / Rejected counts
 * (R12). The TransactionRead.Status enum the summary tallies is one of
 * 'Imported' | 'Approved' | 'Rejected'; TransactionRead.FileLogId (integer) is
 * the owning file's Id.
 *
 * The TransactionRead / TransactionReadList types are imported from @/types/api
 * (the production shapes — added by this story's developer) so the factories
 * always model exactly what the file-detail page consumes.
 * ---------------------------------------------------------------------------
 */

import type { TransactionRead, TransactionReadList } from '@/types/api';

/**
 * A single Transaction as GET /v1/transactions returns it (PascalCase).
 * Default models an Imported transaction belonging to FileLog 1001 with a
 * realistic ZA-style payload. Override FileLogId / Status (and any other field)
 * for ownership and status-count variations.
 */
export const createMockTransaction = (
  overrides: Partial<TransactionRead> = {},
): TransactionRead => ({
  Id: 5001,
  FileLogId: 1001,
  FileName: 'bank-statements-2026-06-01.csv',
  Reference: 'TXN-00001',
  TransactionDate: '2026-06-01T10:00:00Z',
  AccountNumber: '1001-2034-5567',
  Description: 'Payment for invoice 1234',
  Amount: 1500.5,
  TransactionType: 'Debit',
  Currency: 'ZAR',
  Status: 'Imported',
  UserNote: '',
  LastChangedUser: 'System',
  LastChangedDate: '2026-06-01 10:00:00',
  ...overrides,
});

/**
 * A spread of transactions deliberately mixing two owning files and the three
 * terminal/working statuses so the client-side FileLogId filter AND the status
 * tally can both be proven from one list:
 *
 *   FileLog 1001 (the file under test): 2 Imported, 1 Approved, 1 Rejected
 *     -> Total 4 / Imported 2 / Approved 1 / Rejected 1
 *   FileLog 2002 (a DIFFERENT file): 2 transactions that MUST be excluded by the
 *     client-side FileLogId filter (the endpoint can't filter server-side).
 */
export const createMockTransactions = (): TransactionRead[] => [
  createMockTransaction({
    Id: 5001,
    FileLogId: 1001,
    Reference: 'TXN-00001',
    Status: 'Imported',
  }),
  createMockTransaction({
    Id: 5002,
    FileLogId: 1001,
    Reference: 'TXN-00002',
    Status: 'Imported',
  }),
  createMockTransaction({
    Id: 5003,
    FileLogId: 1001,
    Reference: 'TXN-00003',
    Status: 'Approved',
  }),
  createMockTransaction({
    Id: 5004,
    FileLogId: 1001,
    Reference: 'TXN-00004',
    Status: 'Rejected',
  }),
  // Belong to a different file — must NOT be counted against FileLog 1001.
  createMockTransaction({
    Id: 6001,
    FileLogId: 2002,
    Reference: 'TXN-09001',
    Status: 'Approved',
  }),
  createMockTransaction({
    Id: 6002,
    FileLogId: 2002,
    Reference: 'TXN-09002',
    Status: 'Rejected',
  }),
];

/** The GET /v1/transactions envelope ({ Transactions: TransactionRead[] }). */
export const createMockTransactionList = (
  transactions: TransactionRead[] = createMockTransactions(),
): TransactionReadList => ({
  Transactions: transactions,
});
