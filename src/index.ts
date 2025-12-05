/**
 * dserver-client - TypeScript/JavaScript client for dserver signed URL API
 *
 * @packageDocumentation
 */

// Main client class
export { DServerClient } from "./client";

// Types
export {
  // Configuration
  DServerClientConfig,

  // API Response types
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

  // Errors
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
