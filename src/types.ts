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
 * Item information for upload request
 */
export interface UploadItem {
  /** Relative path of the item within the dataset */
  relpath: string;
  /** Optional size hint in bytes */
  size_hint?: number;
}

/**
 * Request body for getting upload URLs
 */
export interface UploadRequest {
  /** Dataset UUID */
  uuid: string;
  /** Dataset name */
  name: string;
  /** List of items to upload */
  items?: UploadItem[];
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
 * Upload URLs for dataset structure files
 */
export interface UploadURLs {
  /** Signed URL for admin metadata */
  admin_metadata: string;
  /** Signed URL for README */
  readme: string;
  /** Signed URL for manifest */
  manifest: string;
  /** Signed URL for structure.json */
  structure: string;
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
