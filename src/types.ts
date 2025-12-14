/**
 * Type definitions for dserver signed URL API
 */

/**
 * Configuration options for the DServerClient
 */
export interface DServerClientConfig {
  /** Base URL of the dserver instance (e.g., "http://localhost:5000") */
  baseUrl: string;
  /** JWT authentication token */
  token?: string;
  /** Optional fetch implementation (defaults to global fetch) */
  fetch?: typeof fetch;
}

/**
 * Response from the dataset signed URLs endpoint
 */
export interface DatasetSignedURLsResponse {
  /** Dataset URI */
  uri: string;
  /** URL expiry time in seconds */
  expiry_seconds: number;
  /** ISO format expiry timestamp */
  expiry_timestamp: string;
  /** Signed URL for admin metadata (dtool file) */
  admin_metadata_url: string;
  /** Signed URL for manifest.json */
  manifest_url: string;
  /** Signed URL for README.yml */
  readme_url: string;
  /** Map of item identifier to signed URL */
  item_urls: Record<string, string>;
  /** Map of overlay name to signed URL */
  overlay_urls: Record<string, string>;
  /** Map of annotation name to signed URL */
  annotation_urls: Record<string, string>;
  /** Dataset tags */
  tags: string[];
}

/**
 * Response from the single item signed URL endpoint
 */
export interface ItemSignedURLResponse {
  /** Dataset URI */
  uri: string;
  /** Item identifier */
  identifier: string;
  /** URL expiry time in seconds */
  expiry_seconds: number;
  /** ISO format expiry timestamp */
  expiry_timestamp: string;
  /** Signed URL for the item */
  url: string;
}

/**
 * Item information for upload request - includes full metadata for server-side manifest generation
 */
export interface UploadItem {
  /** Relative path of the item within the dataset */
  relpath: string;
  /** Size of the item in bytes */
  size_in_bytes: number;
  /** Hash of the item content (MD5 hex digest) */
  hash: string;
  /** UTC timestamp of the item */
  utc_timestamp: number;
}

/**
 * Request body for getting upload URLs.
 * The server uses this metadata to create admin_metadata, manifest, structure,
 * tags, and annotations directly in storage. Only README and items need
 * separate uploads via signed URLs.
 */
export interface UploadRequest {
  /** Dataset UUID */
  uuid: string;
  /** Dataset name */
  name: string;
  /** Username of the dataset creator */
  creator_username: string;
  /** UTC timestamp when dataset was frozen */
  frozen_at: number;
  /** List of items with full metadata */
  items?: UploadItem[];
  /** Dataset tags */
  tags?: string[];
  /** Dataset annotations as key-value pairs */
  annotations?: Record<string, unknown>;
}

/**
 * Upload URL information for a single item
 */
export interface UploadItemURL {
  /** Signed URL for uploading the item */
  url: string;
  /** Relative path of the item */
  relpath: string;
}

/**
 * Upload URLs for dataset files.
 * Only includes URLs for README and items - other metadata is written
 * directly by the server.
 */
export interface UploadURLs {
  /** Signed URL for README */
  readme: string;
  /** Map of item identifier to upload URL info */
  items: Record<string, UploadItemURL>;
}

/**
 * Response from the upload URLs endpoint
 */
export interface UploadURLsResponse {
  /** Dataset UUID */
  uuid: string;
  /** Full dataset URI */
  uri: string;
  /** Base URI */
  base_uri: string;
  /** URL expiry time in seconds */
  expiry_seconds: number;
  /** ISO format expiry timestamp */
  expiry_timestamp: string;
  /** Upload URLs for all dataset components */
  upload_urls: UploadURLs;
}

/**
 * Request body for signaling upload completion
 */
export interface UploadCompleteRequest {
  /** Dataset URI */
  uri: string;
}

/**
 * Response from the upload complete endpoint
 */
export interface UploadCompleteResponse {
  /** Dataset URI */
  uri: string;
  /** Registration status */
  status: string;
  /** Dataset name */
  name: string;
  /** Dataset UUID */
  uuid: string;
}

/**
 * dtool dataset admin metadata
 */
export interface AdminMetadata {
  uuid: string;
  name: string;
  type: "dataset" | "protodataset";
  creator_username: string;
  created_at?: number;
  frozen_at?: number;
  [key: string]: unknown;
}

/**
 * dtool manifest item
 */
export interface ManifestItem {
  hash: string;
  relpath: string;
  size_in_bytes: number;
  utc_timestamp: number;
}

/**
 * dtool dataset manifest
 */
export interface Manifest {
  dtoolcore_version: string;
  hash_function: string;
  items: Record<string, ManifestItem>;
}

/**
 * Progress callback for download/upload operations
 */
export interface ProgressCallback {
  (loaded: number, total: number, item?: string): void;
}

/**
 * Options for download operations
 */
export interface DownloadOptions {
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Options for upload operations
 */
export interface UploadOptions {
  /** Progress callback */
  onProgress?: ProgressCallback;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Dataset README content (YAML string) */
  readme?: string;
  /** Dataset annotations */
  annotations?: Record<string, unknown>;
  /** Dataset tags */
  tags?: string[];
}

/**
 * File to upload with its content
 */
export interface FileToUpload {
  /** Relative path within the dataset */
  relpath: string;
  /** File content as Blob, ArrayBuffer, or string */
  content: Blob | ArrayBuffer | string;
  /** Optional MIME type */
  contentType?: string;
}

/**
 * Error thrown by the dserver client
 */
export class DServerError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly statusText?: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "DServerError";
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends DServerError {
  constructor(message = "Authentication failed") {
    super(message, 401, "Unauthorized");
    this.name = "AuthenticationError";
  }
}

/**
 * Error thrown when authorization fails
 */
export class AuthorizationError extends DServerError {
  constructor(message = "Access denied") {
    super(message, 403, "Forbidden");
    this.name = "AuthorizationError";
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends DServerError {
  constructor(message = "Resource not found") {
    super(message, 404, "Not Found");
    this.name = "NotFoundError";
  }
}

// =========================================================================
// REST API Types (for standard dserver endpoints)
// =========================================================================

/**
 * Dataset entry returned from search/list endpoints
 */
export interface DatasetEntry {
  uuid: string;
  uri: string;
  base_uri: string;
  name: string;
  creator_username: string;
  created_at: number;
  frozen_at: number;
  tags?: string[];
  number_of_items?: number;
  size_in_bytes?: number;
}

/**
 * Search query parameters
 */
export interface SearchQuery {
  free_text?: string;
  creator_usernames?: string[];
  base_uris?: string[];
  uuids?: string[];
  tags?: string[];
}

/**
 * Pagination parameters for search
 */
export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort?: string;
}

/**
 * Pagination info returned in headers
 */
export interface PaginationInfo {
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

/**
 * Response with pagination
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

/**
 * Server config versions
 */
export interface ServerVersions {
  dservercore?: string;
  dserver_search_plugin_mongo?: string;
  dserver_retrieve_plugin_mongo?: string;
  dserver_direct_mongo_plugin?: string;
  dserver_signed_url_plugin?: string;
  dserver_dependency_graph_plugin?: string;
  dserver_notification_plugin?: string;
  [key: string]: string | undefined;
}

/**
 * Tags response
 */
export interface TagsResponse {
  tags: string[];
}

/**
 * Annotations response (key-value pairs)
 */
export interface AnnotationsResponse {
  annotations: Record<string, unknown>;
}

/**
 * Readme response
 */
export interface ReadmeResponse {
  readme: string;
}

/**
 * Manifest response from REST API
 */
export interface ManifestResponse {
  dtoolcore_version: string;
  hash_function: string;
  items: Record<string, ManifestItem>;
}

/**
 * User summary info
 */
export interface SummaryInfo {
  number_of_datasets: number;
  total_size_in_bytes: number;
  creator_usernames: string[];
  base_uris: string[];
  tags: string[];
  datasets_per_creator: Record<string, number>;
  datasets_per_base_uri: Record<string, number>;
  datasets_per_tag: Record<string, number>;
  size_in_bytes_per_creator: Record<string, number>;
  size_in_bytes_per_base_uri: Record<string, number>;
  size_in_bytes_per_tag: Record<string, number>;
}

// =========================================================================
// User Management Types
// =========================================================================

/**
 * User information returned from user endpoints
 */
export interface UserInfo {
  username: string;
  is_admin: boolean;
  search_permissions_on_base_uris: string[];
  register_permissions_on_base_uris: string[];
}

/**
 * User creation/update request
 */
export interface UserRequest {
  is_admin?: boolean;
}

/**
 * Base URI information
 */
export interface BaseURIInfo {
  base_uri: string;
  users_with_search_permissions: string[];
  users_with_register_permissions: string[];
}

/**
 * Base URI permissions update request
 */
export interface BaseURIPermissionsRequest {
  users_with_search_permissions?: string[];
  users_with_register_permissions?: string[];
}

// =========================================================================
// Dependency Graph Plugin Types
// =========================================================================

/**
 * Dataset entry with dependency information from graph plugin.
 * The derived_from field contains UUID strings of parent datasets.
 */
export interface GraphDatasetEntry extends DatasetEntry {
  /** UUIDs of datasets this dataset is derived from (as string array) */
  derived_from?: string[];
}
