/**
 * dserver-client - TypeScript/JavaScript client for dserver signed URL API
 *
 * @packageDocumentation
 */

// Main client class
export { DServerClient } from "./client";

// Types
export type {
  // Configuration
  DServerClientConfig,

  // Signed URL API Response types
  DatasetSignedURLsResponse,
  ItemSignedURLResponse,
  UploadRequest,
  UploadURLsResponse,
  UploadCompleteRequest,
  UploadCompleteResponse,
  UploadItem,
  UploadItemURL,
  UploadURLs,

  // Dataset types
  AdminMetadata,
  Manifest,
  ManifestItem,

  // Operation options
  DownloadOptions,
  UploadOptions,
  FileToUpload,
  ProgressCallback,

  // REST API types
  DatasetEntry,
  SearchQuery,
  PaginationParams,
  PaginationInfo,
  PaginatedResponse,
  ServerVersions,
  TagsResponse,
  AnnotationsResponse,
  ReadmeResponse,
  ManifestResponse,
  SummaryInfo,

  // User management types
  UserInfo,
  UserRequest,
  BaseURIInfo,
  BaseURIPermissionsRequest,
} from "./types";

// Error classes (these are values, not just types)
export {
  DServerError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from "./types";

// Utilities
export {
  generateIdentifier,
  generateUUID,
  encodeUri,
  getCurrentTimestamp,
  parseISOTimestamp,
  isExpired,
  timeUntilExpiry,
  formatBytes,
  delay,
  withRetry,
  chunk,
  parallelLimit,
} from "./utils";

// Vue composables (tree-shakeable - only imported when used)
export {
  useDServerClient,
  useDatasetDownload,
  useDatasetUpload,
} from "./vue";
