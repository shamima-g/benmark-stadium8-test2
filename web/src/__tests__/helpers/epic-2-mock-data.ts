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
