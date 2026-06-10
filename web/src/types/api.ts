/**
 * API Type Definitions Template
 *
 * Generic type definitions for API communication
 * Customize these based on your API's response format
 */

/**
 * DefaultResponse - Standard API response structure
 * Customize this based on your API's response format
 * Common in REST APIs for mutation endpoints (POST, PUT, DELETE)
 */
export interface DefaultResponse {
  Id: number;
  MessageType: string;
  Messages: string[];
}

/**
 * APIError - Standardized error object for API failures
 * Used throughout the application for consistent error handling
 */
export interface APIError {
  message: string;
  statusCode?: number;
  details?: string[];
  endpoint?: string;
}

export type QueryParamScalar = string | number | boolean;
export type QueryParams = Record<
  string,
  QueryParamScalar | ReadonlyArray<QueryParamScalar> | undefined
>;

/**
 * APIRequestConfig - Configuration options for API requests
 * Extends standard fetch RequestInit with additional options
 */
export interface APIRequestConfig extends RequestInit {
  params?: QueryParams;
  /**
   * When true, the client injects an auth header from getAuthHeader() (env-var
   * driven, populated by api-connectivity-agent during INTAKE Step 4b). Caller-
   * supplied headers always win — set headers explicitly to override.
   */
  requiresAuth?: boolean;
  lastChangedUser?: string; // For audit trails - remove if not needed
  isBinaryResponse?: boolean; // Flag to indicate response should be treated as binary data
}

/**
 * APIResponse - Generic wrapper for successful API responses
 * Provides type-safe response handling
 */
export interface APIResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

/**
 * API Message Type enum values
 * Customize based on your API's message types
 */
export const APIMessageType = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export type APIMessageTypeValue =
  (typeof APIMessageType)[keyof typeof APIMessageType];

/**
 * HTTP Status Codes - Common status codes used in the application
 */
export const HTTPStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type HTTPStatusCode = (typeof HTTPStatus)[keyof typeof HTTPStatus];

/**
 * FileLog — a file-ingestion log entry as the transactions API returns it
 * (PascalCase), mirroring documentation/transactions-api.yaml
 * components.schemas.FileLog.
 *
 * Field notes the dashboard relies on (project-brief §6 / §13):
 *   - CurrentFileName carries the file name shown in the "File Name" column
 *     (the spec uses CurrentFileName, NOT a `FileName` field).
 *   - RecordCount is typed `string` in the spec (e.g. "1240") — the row mapper
 *     coerces it to a number for numeric sort/display.
 *   - CurrentStatus is the resolved status-enum string that drives the status
 *     badge (§13: CurrentStatus, not the derived LastExecutedActivityName).
 */
export interface FileLog {
  Id: number;
  ProcessDate: string;
  SettingId: number;
  SettingName: string;
  ProcessInstanceId: string;
  CurrentFolder: string;
  CurrentFileName: string;
  FileHash: string;
  RecordCount: string;
  Direction: string;
  CurrentStatus: string;
  LastExecutedActivityName: string;
  ProcessDefinitionId: string;
  ProcessName: string;
  IsActive: boolean;
  BulkErrorFile: string;
  HasBulkErrorFile: string;
}

/**
 * FileLogList — the GET /v1/file-logs?IsActive=Yes envelope
 * ({ FileLog: FileLog[] }), mirroring components.schemas.FileLogList.
 */
export interface FileLogList {
  FileLog: FileLog[];
}

/**
 * TransactionRead — a transaction as GET /v1/transactions returns it
 * (PascalCase), mirroring documentation/transactions-api.yaml
 * components.schemas.TransactionRead.
 *
 * Field notes the file-detail summary relies on (project-brief §6 / §13 and the
 * Epic 2 spec-gap note in the epic overview):
 *   - FileLogId (integer) is the owning file's Id. GET /v1/transactions exposes
 *     no FileLogId/Status query params (the documented spec gap), so the file-
 *     detail page fetches the full list and filters by FileLogId client-side
 *     before tallying the status counts.
 *   - Status is the per-transaction status enum string ('Imported' | 'Approved'
 *     | 'Rejected') the status-count summary tallies (R12).
 *   - Amount is typed `number` in the spec; the remaining fields are carried for
 *     completeness but are not consumed by the status-count summary.
 */
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
 * TransactionReadList — the GET /v1/transactions envelope
 * ({ Transactions: TransactionRead[] }), mirroring
 * components.schemas.TransactionReadList.
 */
export interface TransactionReadList {
  Transactions: TransactionRead[];
}

/**
 * FileSettingRead — a File Setting as GET /v1/file-settings returns it
 * (PascalCase), mirroring documentation/transactions-api.yaml
 * components.schemas.FileSettingRead.
 *
 * The upload page (Epic 2, Story 2) reads `Id` and `Name` to populate the File
 * Setting selector; the chosen setting supplies the FileSettingId /
 * FileSettingName query params the POST /v1/files/upload contract requires (R3).
 * The remaining fields are carried for completeness but are not consumed by the
 * upload flow.
 */
export interface FileSettingRead {
  Id: number;
  Name: string;
  SourceId: number;
  SourceName: string;
  TypeId: number;
  TypeName: string;
  Direction: string;
  StagingSchema: string;
  StagingTable: string;
  TargetSchema: string;
  TargetTable: string;
  ProcessDefinitionId: string;
  ProcessDefinitionName: string;
  IsActive: boolean;
  LastChangedUser: string;
  LastChangedDate: string;
}

/**
 * FileSettingReadList — the GET /v1/file-settings envelope
 * ({ FileSettings: FileSettingRead[] }), mirroring
 * components.schemas.FileSettingReadList.
 */
export interface FileSettingReadList {
  FileSettings: FileSettingRead[];
}
