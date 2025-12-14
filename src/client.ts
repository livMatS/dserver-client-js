/**
 * DServer Client - TypeScript client for dserver signed URL API
 */

import {
  DServerClientConfig,
  DatasetSignedURLsResponse,
  ItemSignedURLResponse,
  UploadRequest,
  UploadURLsResponse,
  UploadCompleteRequest,
  UploadCompleteResponse,
  AdminMetadata,
  Manifest,
  ManifestItem,
  DownloadOptions,
  UploadOptions,
  FileToUpload,
  DServerError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
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
  // Dependency graph types
  GraphDatasetEntry,
} from "./types";

import {
  encodeUri,
  generateIdentifier,
  generateUUID,
  getCurrentTimestamp,
  parallelLimit,
} from "./utils";

/**
 * Client for interacting with dserver's signed URL API
 *
 * @example
 * ```typescript
 * const client = new DServerClient({
 *   baseUrl: "http://localhost:5000",
 *   token: "your-jwt-token"
 * });
 *
 * // Get signed URLs for a dataset
 * const urls = await client.getDatasetSignedUrls("s3://bucket/uuid");
 *
 * // Download an item
 * const content = await client.downloadItem(urls, "item-identifier");
 * ```
 */
export class DServerClient {
  private baseUrl: string;
  private token?: string;
  private fetchImpl: typeof fetch;

  constructor(config: DServerClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.token = config.token;
    // Bind fetch to window/globalThis to avoid "Illegal invocation" errors
    this.fetchImpl = config.fetch ?? fetch.bind(globalThis);
  }

  /**
   * Set or update the authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Make an authenticated request to dserver
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
      signal,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await this.fetchImpl(url, options);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      switch (response.status) {
        case 401:
          throw new AuthenticationError();
        case 403:
          throw new AuthorizationError();
        case 404:
          throw new NotFoundError();
        default:
          throw new DServerError(
            `Request failed: ${response.statusText}`,
            response.status,
            response.statusText,
            errorBody
          );
      }
    }

    return response.json();
  }

  // =========================================================================
  // Signed URL API
  // =========================================================================

  /**
   * Get signed URLs for reading an entire dataset
   *
   * @param uri - Dataset URI (e.g., "s3://bucket/uuid")
   * @returns Signed URLs for all dataset components
   */
  async getDatasetSignedUrls(uri: string): Promise<DatasetSignedURLsResponse> {
    const encodedUri = encodeUri(uri);
    return this.request<DatasetSignedURLsResponse>(
      "GET",
      `/signed-urls/dataset/${encodedUri}`
    );
  }

  /**
   * Get a signed URL for a single dataset item
   *
   * @param uri - Dataset URI
   * @param identifier - Item identifier (SHA-1 hash of relpath)
   * @returns Signed URL for the item
   */
  async getItemSignedUrl(
    uri: string,
    identifier: string
  ): Promise<ItemSignedURLResponse> {
    const encodedUri = encodeUri(uri);
    return this.request<ItemSignedURLResponse>(
      "GET",
      `/signed-urls/item/${encodedUri}/${identifier}`
    );
  }

  /**
   * Get signed URLs for uploading a new dataset
   *
   * @param baseUri - Base URI (e.g., "s3://bucket")
   * @param request - Upload request with UUID, name, and items
   * @returns Signed URLs for uploading dataset components
   */
  async getUploadUrls(
    baseUri: string,
    request: UploadRequest
  ): Promise<UploadURLsResponse> {
    const encodedBaseUri = encodeUri(baseUri);
    return this.request<UploadURLsResponse>(
      "POST",
      `/signed-urls/upload/${encodedBaseUri}`,
      request
    );
  }

  /**
   * Signal that a dataset upload is complete
   *
   * @param uri - Dataset URI
   * @returns Registration result
   */
  async signalUploadComplete(uri: string): Promise<UploadCompleteResponse> {
    const request: UploadCompleteRequest = { uri };
    return this.request<UploadCompleteResponse>(
      "POST",
      `/signed-urls/upload-complete`,
      request
    );
  }

  // =========================================================================
  // High-level download operations
  // =========================================================================

  /**
   * Download a dataset item using its signed URL
   *
   * @param urls - Signed URLs response from getDatasetSignedUrls
   * @param identifier - Item identifier
   * @param options - Download options
   * @returns Item content as ArrayBuffer
   */
  async downloadItem(
    urls: DatasetSignedURLsResponse,
    identifier: string,
    options: DownloadOptions = {}
  ): Promise<ArrayBuffer> {
    const itemUrl = urls.item_urls[identifier];
    if (!itemUrl) {
      throw new NotFoundError(`Item ${identifier} not found in dataset`);
    }

    const response = await this.fetchImpl(itemUrl, { signal: options.signal });
    if (!response.ok) {
      throw new DServerError(
        `Failed to download item: ${response.statusText}`,
        response.status
      );
    }

    if (options.onProgress && response.body) {
      const reader = response.body.getReader();
      const contentLength = Number(response.headers.get("Content-Length")) || 0;
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        options.onProgress(receivedLength, contentLength, identifier);
      }

      const result = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        result.set(chunk, position);
        position += chunk.length;
      }
      return result.buffer;
    }

    return response.arrayBuffer();
  }

  /**
   * Download and parse the dataset manifest
   *
   * @param urls - Signed URLs response
   * @returns Parsed manifest
   */
  async downloadManifest(urls: DatasetSignedURLsResponse): Promise<Manifest> {
    const response = await this.fetchImpl(urls.manifest_url);
    if (!response.ok) {
      throw new DServerError("Failed to download manifest", response.status);
    }
    return response.json();
  }

  /**
   * Download and parse the dataset admin metadata
   *
   * @param urls - Signed URLs response
   * @returns Parsed admin metadata
   */
  async downloadAdminMetadata(
    urls: DatasetSignedURLsResponse
  ): Promise<AdminMetadata> {
    const response = await this.fetchImpl(urls.admin_metadata_url);
    if (!response.ok) {
      throw new DServerError(
        "Failed to download admin metadata",
        response.status
      );
    }
    return response.json();
  }

  /**
   * Download the dataset README
   *
   * @param urls - Signed URLs response
   * @returns README content as string
   */
  async downloadReadme(urls: DatasetSignedURLsResponse): Promise<string> {
    const response = await this.fetchImpl(urls.readme_url);
    if (!response.ok) {
      throw new DServerError("Failed to download README", response.status);
    }
    return response.text();
  }

  /**
   * Download an overlay
   *
   * @param urls - Signed URLs response
   * @param overlayName - Name of the overlay
   * @returns Overlay data
   */
  async downloadOverlay(
    urls: DatasetSignedURLsResponse,
    overlayName: string
  ): Promise<Record<string, unknown>> {
    const overlayUrl = urls.overlay_urls[overlayName];
    if (!overlayUrl) {
      throw new NotFoundError(`Overlay ${overlayName} not found`);
    }
    const response = await this.fetchImpl(overlayUrl);
    if (!response.ok) {
      throw new DServerError("Failed to download overlay", response.status);
    }
    return response.json();
  }

  /**
   * Download an annotation
   *
   * @param urls - Signed URLs response
   * @param annotationName - Name of the annotation
   * @returns Annotation value
   */
  async downloadAnnotation(
    urls: DatasetSignedURLsResponse,
    annotationName: string
  ): Promise<unknown> {
    const annotationUrl = urls.annotation_urls[annotationName];
    if (!annotationUrl) {
      throw new NotFoundError(`Annotation ${annotationName} not found`);
    }
    const response = await this.fetchImpl(annotationUrl);
    if (!response.ok) {
      throw new DServerError("Failed to download annotation", response.status);
    }
    return response.json();
  }

  // =========================================================================
  // High-level upload operations
  // =========================================================================

  /**
   * Create and upload a new dataset
   *
   * The server handles admin_metadata, manifest, structure, tags, and annotations
   * directly based on metadata sent in the upload request. We only need to upload
   * README and item files.
   *
   * @param baseUri - Base URI (e.g., "s3://bucket")
   * @param name - Dataset name
   * @param files - Files to upload
   * @param options - Upload options (readme, tags, annotations)
   * @returns Upload completion response
   */
  async createDataset(
    baseUri: string,
    name: string,
    files: FileToUpload[],
    options: UploadOptions = {}
  ): Promise<UploadCompleteResponse> {
    const uuid = generateUUID();
    const creatorUsername = "webapp-user"; // TODO: Get from token
    const frozenAt = getCurrentTimestamp();

    // Build item metadata with identifiers and hashes
    const itemsWithMetadata = await Promise.all(
      files.map(async (file) => {
        const identifier = await generateIdentifier(file.relpath);
        const { size, hash } = await this.computeItemMetadata(file);
        return {
          ...file,
          identifier,
          size_in_bytes: size,
          hash,
          utc_timestamp: frozenAt,
        };
      })
    );

    // Request upload URLs - server writes metadata directly to storage
    const uploadInfo = await this.getUploadUrls(baseUri, {
      uuid,
      name,
      creator_username: creatorUsername,
      frozen_at: frozenAt,
      items: itemsWithMetadata.map((item) => ({
        relpath: item.relpath,
        size_in_bytes: item.size_in_bytes,
        hash: item.hash,
        utc_timestamp: item.utc_timestamp,
      })),
      tags: options.tags,
      annotations: options.annotations,
    });

    const totalBytes = itemsWithMetadata.reduce(
      (sum, item) => sum + item.size_in_bytes,
      0
    );
    let uploadedBytes = 0;

    // Upload README
    const readme = options.readme || "---\n";
    await this.uploadText(uploadInfo.upload_urls.readme, readme, options.signal);

    // Upload items in parallel with concurrency limit
    await parallelLimit(itemsWithMetadata, 4, async (item) => {
      const uploadUrl = uploadInfo.upload_urls.items[item.identifier];
      if (!uploadUrl) {
        throw new DServerError(
          `No upload URL for item ${item.relpath}`,
          500
        );
      }

      let body: BodyInit;
      if (item.content instanceof Blob) {
        body = item.content;
      } else if (item.content instanceof ArrayBuffer) {
        body = item.content;
      } else {
        body = item.content;
      }

      const response = await this.fetchImpl(uploadUrl.url, {
        method: "PUT",
        body,
        headers: item.contentType
          ? { "Content-Type": item.contentType }
          : undefined,
        signal: options.signal,
      });

      if (!response.ok) {
        throw new DServerError(
          `Failed to upload ${item.relpath}`,
          response.status
        );
      }

      uploadedBytes += item.size_in_bytes;
      options.onProgress?.(uploadedBytes, totalBytes, item.relpath);
    });

    // Signal upload complete
    return this.signalUploadComplete(uploadInfo.uri);
  }

  /**
   * Compute size and hash for a file item
   */
  private async computeItemMetadata(
    item: FileToUpload
  ): Promise<{ size: number; hash: string }> {
    let size: number;
    let contentBuffer: ArrayBuffer;

    if (item.content instanceof Blob) {
      size = item.content.size;
      contentBuffer = await item.content.arrayBuffer();
    } else if (item.content instanceof ArrayBuffer) {
      size = item.content.byteLength;
      contentBuffer = item.content;
    } else {
      const encoded = new TextEncoder().encode(item.content);
      size = encoded.length;
      contentBuffer = encoded.buffer;
    }

    // Calculate MD5 hash (or SHA-256 as fallback)
    const hashBuffer = await crypto.subtle
      .digest("MD5", contentBuffer)
      .catch(() => crypto.subtle.digest("SHA-256", contentBuffer));

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return { size, hash };
  }

  /**
   * Upload text data to a signed URL
   */
  private async uploadText(
    url: string,
    text: string,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await this.fetchImpl(url, {
      method: "PUT",
      body: text,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      signal,
    });

    if (!response.ok) {
      throw new DServerError("Failed to upload text", response.status);
    }
  }

  // =========================================================================
  // REST API Methods (standard dserver endpoints)
  // =========================================================================

  /**
   * Get server configuration versions
   */
  async getServerVersions(): Promise<ServerVersions> {
    const response = await this.request<{ versions: ServerVersions }>(
      "GET",
      "/config/versions"
    );
    return response.versions;
  }

  /**
   * Check server health (no auth required)
   */
  async checkHealth(): Promise<{ status: string }> {
    const url = `${this.baseUrl}/config/health`;
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new DServerError("Health check failed", response.status);
    }
    return response.json();
  }

  /**
   * Get user summary info
   */
  async getUserSummary(username: string): Promise<SummaryInfo> {
    return this.request<SummaryInfo>("GET", `/users/${username}/summary`);
  }

  /**
   * Search datasets with pagination
   */
  async searchDatasets(
    query: SearchQuery,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<DatasetEntry>> {
    const params = new URLSearchParams();
    if (pagination?.page) params.set("page", String(pagination.page));
    if (pagination?.page_size) params.set("page_size", String(pagination.page_size));
    if (pagination?.sort) params.set("sort", pagination.sort);

    const queryString = params.toString();
    const path = `/uris${queryString ? `?${queryString}` : ""}`;

    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      this.handleErrorResponse(response);
    }

    const data: DatasetEntry[] = await response.json();
    const paginationHeader = response.headers.get("x-pagination");
    const paginationInfo: PaginationInfo = paginationHeader
      ? JSON.parse(paginationHeader)
      : { total: data.length, page: 1, per_page: data.length, pages: 1 };

    return { data, pagination: paginationInfo };
  }

  /**
   * Handle error responses (helper for methods that need headers)
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    switch (response.status) {
      case 401:
        throw new AuthenticationError();
      case 403:
        throw new AuthorizationError();
      case 404:
        throw new NotFoundError();
      default:
        throw new DServerError(
          `Request failed: ${response.statusText}`,
          response.status,
          response.statusText,
          errorBody
        );
    }
  }

  /**
   * Get manifest for a dataset
   */
  async getManifest(uri: string): Promise<ManifestResponse> {
    const encodedUri = encodeURIComponent(uri);
    return this.request<ManifestResponse>("GET", `/manifests/${encodedUri}`);
  }

  /**
   * Get readme for a dataset
   */
  async getReadme(uri: string): Promise<ReadmeResponse> {
    const encodedUri = encodeURIComponent(uri);
    return this.request<ReadmeResponse>("GET", `/readmes/${encodedUri}`);
  }

  /**
   * Set readme for a dataset
   */
  async setReadme(uri: string, content: string): Promise<ReadmeResponse> {
    const encodedUri = encodeURIComponent(uri);
    return this.request<ReadmeResponse>("PUT", `/readmes/${encodedUri}`, {
      readme: content,
    });
  }

  // =========================================================================
  // Tags API
  // =========================================================================

  /**
   * Get tags for a dataset
   */
  async getTags(uri: string): Promise<TagsResponse> {
    const encodedUri = encodeURIComponent(uri);
    return this.request<TagsResponse>("GET", `/tags/${encodedUri}`);
  }

  /**
   * Set all tags for a dataset (replaces existing)
   */
  async setTags(uri: string, tags: string[]): Promise<TagsResponse> {
    const encodedUri = encodeURIComponent(uri);
    return this.request<TagsResponse>("PUT", `/tags/${encodedUri}`, { tags });
  }

  /**
   * Add a single tag to a dataset
   */
  async addTag(uri: string, tag: string): Promise<TagsResponse> {
    const encodedUri = encodeURIComponent(uri);
    const encodedTag = encodeURIComponent(tag);
    return this.request<TagsResponse>(
      "POST",
      `/tags/${encodedUri}/${encodedTag}`,
      {}
    );
  }

  /**
   * Remove a single tag from a dataset
   */
  async removeTag(uri: string, tag: string): Promise<TagsResponse> {
    const encodedUri = encodeURIComponent(uri);
    const encodedTag = encodeURIComponent(tag);
    return this.request<TagsResponse>(
      "DELETE",
      `/tags/${encodedUri}/${encodedTag}`
    );
  }

  // =========================================================================
  // Annotations API
  // =========================================================================

  /**
   * Get annotations for a dataset
   */
  async getAnnotations(uri: string): Promise<AnnotationsResponse> {
    const encodedUri = encodeURIComponent(uri);
    return this.request<AnnotationsResponse>(
      "GET",
      `/annotations/${encodedUri}`
    );
  }

  /**
   * Set all annotations for a dataset (replaces existing)
   */
  async setAnnotations(
    uri: string,
    annotations: Record<string, unknown>
  ): Promise<AnnotationsResponse> {
    const encodedUri = encodeURIComponent(uri);
    return this.request<AnnotationsResponse>(
      "PUT",
      `/annotations/${encodedUri}`,
      { annotations }
    );
  }

  /**
   * Set a single annotation
   */
  async setAnnotation(
    uri: string,
    name: string,
    value: unknown
  ): Promise<AnnotationsResponse> {
    const encodedUri = encodeURIComponent(uri);
    const encodedName = encodeURIComponent(name);
    return this.request<AnnotationsResponse>(
      "PUT",
      `/annotations/${encodedUri}/${encodedName}`,
      { value }
    );
  }

  /**
   * Delete a single annotation
   */
  async deleteAnnotation(
    uri: string,
    name: string
  ): Promise<AnnotationsResponse> {
    const encodedUri = encodeURIComponent(uri);
    const encodedName = encodeURIComponent(name);
    return this.request<AnnotationsResponse>(
      "DELETE",
      `/annotations/${encodedUri}/${encodedName}`
    );
  }

  // =========================================================================
  // User Management API (Admin only)
  // =========================================================================

  /**
   * Get current user info (includes is_admin flag)
   */
  async getCurrentUser(): Promise<UserInfo> {
    return this.request<UserInfo>("GET", "/me");
  }

  /**
   * List all users (admin only)
   */
  async listUsers(): Promise<UserInfo[]> {
    return this.request<UserInfo[]>("GET", "/users");
  }

  /**
   * Get a specific user
   */
  async getUser(username: string): Promise<UserInfo> {
    const encodedUsername = encodeURIComponent(username);
    return this.request<UserInfo>("GET", `/users/${encodedUsername}`);
  }

  /**
   * Create or register a new user (admin only)
   * Note: dserver uses PUT for user creation/update (idempotent operation)
   */
  async createUser(username: string, options?: UserRequest): Promise<UserInfo> {
    const encodedUsername = encodeURIComponent(username);
    return this.request<UserInfo>("PUT", `/users/${encodedUsername}`, options || {});
  }

  /**
   * Delete a user (admin only)
   */
  async deleteUser(username: string): Promise<void> {
    const encodedUsername = encodeURIComponent(username);
    await this.request<void>("DELETE", `/users/${encodedUsername}`);
  }

  /**
   * Update user admin status (admin only)
   */
  async updateUserAdmin(username: string, isAdmin: boolean): Promise<UserInfo> {
    const encodedUsername = encodeURIComponent(username);
    return this.request<UserInfo>("PATCH", `/users/${encodedUsername}`, { is_admin: isAdmin });
  }

  // =========================================================================
  // Base URI Management API (Admin only)
  // =========================================================================

  /**
   * List all base URIs (admin only)
   */
  async listBaseURIs(): Promise<BaseURIInfo[]> {
    return this.request<BaseURIInfo[]>("GET", "/base-uris");
  }

  /**
   * Get a specific base URI
   */
  async getBaseURI(baseUri: string): Promise<BaseURIInfo> {
    const encodedUri = encodeURIComponent(baseUri);
    return this.request<BaseURIInfo>("GET", `/base-uris/${encodedUri}`);
  }

  /**
   * Register a new base URI (admin only)
   */
  async createBaseURI(baseUri: string): Promise<BaseURIInfo> {
    const encodedUri = encodeURIComponent(baseUri);
    return this.request<BaseURIInfo>("POST", `/base-uris/${encodedUri}`, {});
  }

  /**
   * Delete a base URI (admin only)
   */
  async deleteBaseURI(baseUri: string): Promise<void> {
    const encodedUri = encodeURIComponent(baseUri);
    await this.request<void>("DELETE", `/base-uris/${encodedUri}`);
  }

  /**
   * Grant search permission to a user on a base URI (admin only)
   */
  async grantSearchPermission(username: string, baseUri: string): Promise<UserInfo> {
    const encodedUsername = encodeURIComponent(username);
    const encodedUri = encodeURIComponent(baseUri);
    return this.request<UserInfo>("POST", `/users/${encodedUsername}/search/${encodedUri}`, {});
  }

  /**
   * Revoke search permission from a user on a base URI (admin only)
   */
  async revokeSearchPermission(username: string, baseUri: string): Promise<UserInfo> {
    const encodedUsername = encodeURIComponent(username);
    const encodedUri = encodeURIComponent(baseUri);
    return this.request<UserInfo>("DELETE", `/users/${encodedUsername}/search/${encodedUri}`);
  }

  /**
   * Grant register permission to a user on a base URI (admin only)
   */
  async grantRegisterPermission(username: string, baseUri: string): Promise<UserInfo> {
    const encodedUsername = encodeURIComponent(username);
    const encodedUri = encodeURIComponent(baseUri);
    return this.request<UserInfo>("POST", `/users/${encodedUsername}/register/${encodedUri}`, {});
  }

  /**
   * Revoke register permission from a user on a base URI (admin only)
   */
  async revokeRegisterPermission(username: string, baseUri: string): Promise<UserInfo> {
    const encodedUsername = encodeURIComponent(username);
    const encodedUri = encodeURIComponent(baseUri);
    return this.request<UserInfo>("DELETE", `/users/${encodedUsername}/register/${encodedUri}`);
  }

  // =========================================================================
  // UUID Lookup API
  // =========================================================================

  /**
   * Get datasets by UUID
   * Returns all instances of a dataset with that UUID across base URIs the user has access to
   *
   * @param uuid - Dataset UUID
   * @returns Array of datasets with that UUID
   */
  async getDatasetsByUuid(uuid: string): Promise<DatasetEntry[]> {
    return this.request<DatasetEntry[]>("GET", `/uuids/${uuid}`);
  }

  // =========================================================================
  // Dependency Graph Plugin API
  // =========================================================================

  /**
   * Get dependency graph for a dataset by UUID
   * Returns all datasets in the same dependency graph (bidirectional traversal)
   * Requires dserver-dependency-graph-plugin to be installed
   *
   * @param uuid - Dataset UUID
   * @returns Array of datasets in the dependency graph with derived_from relationships
   */
  async getDependencyGraph(uuid: string): Promise<GraphDatasetEntry[]> {
    return this.request<GraphDatasetEntry[]>("GET", `/graph/uuids/${uuid}`);
  }
}
