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
   * @param baseUri - Base URI (e.g., "s3://bucket")
   * @param name - Dataset name
   * @param files - Files to upload
   * @param options - Upload options
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

    // Generate identifiers for all files
    const itemsWithIds = await Promise.all(
      files.map(async (file) => ({
        ...file,
        identifier: await generateIdentifier(file.relpath),
      }))
    );

    // Request upload URLs
    const uploadInfo = await this.getUploadUrls(baseUri, {
      uuid,
      name,
      items: files.map((f) => ({ relpath: f.relpath })),
    });

    const totalBytes = files.reduce((sum, f) => {
      if (f.content instanceof Blob) {
        return sum + f.content.size;
      } else if (f.content instanceof ArrayBuffer) {
        return sum + f.content.byteLength;
      } else {
        return sum + new TextEncoder().encode(f.content).length;
      }
    }, 0);

    let uploadedBytes = 0;

    // Upload items in parallel with concurrency limit
    await parallelLimit(itemsWithIds, 4, async (item) => {
      const uploadUrl = uploadInfo.upload_urls.items[item.identifier];
      if (!uploadUrl) {
        throw new DServerError(
          `No upload URL for item ${item.relpath}`,
          500
        );
      }

      let body: BodyInit;
      let size: number;

      if (item.content instanceof Blob) {
        body = item.content;
        size = item.content.size;
      } else if (item.content instanceof ArrayBuffer) {
        body = item.content;
        size = item.content.byteLength;
      } else {
        body = item.content;
        size = new TextEncoder().encode(item.content).length;
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

      uploadedBytes += size;
      options.onProgress?.(uploadedBytes, totalBytes, item.relpath);
    });

    // Build and upload manifest
    const manifest = await this.buildManifest(itemsWithIds);
    await this.uploadJson(uploadInfo.upload_urls.manifest, manifest, options.signal);

    // Upload admin metadata
    const adminMetadata: AdminMetadata = {
      uuid,
      name,
      type: "dataset",
      creator_username: creatorUsername,
      created_at: getCurrentTimestamp(),
      frozen_at: getCurrentTimestamp(),
    };
    await this.uploadJson(
      uploadInfo.upload_urls.admin_metadata,
      adminMetadata,
      options.signal
    );

    // Upload README if provided
    if (options.readme) {
      await this.uploadText(uploadInfo.upload_urls.readme, options.readme, options.signal);
    } else {
      // Upload empty README
      await this.uploadText(uploadInfo.upload_urls.readme, "---\n", options.signal);
    }

    // Signal upload complete
    return this.signalUploadComplete(uploadInfo.uri);
  }

  /**
   * Build a manifest from file items
   */
  private async buildManifest(
    items: Array<FileToUpload & { identifier: string }>
  ): Promise<Manifest> {
    const manifestItems: Record<string, ManifestItem> = {};

    for (const item of items) {
      let size: number;
      if (item.content instanceof Blob) {
        size = item.content.size;
      } else if (item.content instanceof ArrayBuffer) {
        size = item.content.byteLength;
      } else {
        size = new TextEncoder().encode(item.content).length;
      }

      // Calculate hash (simplified - in production would hash content)
      // Get content as BufferSource first
      const contentBuffer: BufferSource = item.content instanceof Blob
        ? await item.content.arrayBuffer()
        : item.content instanceof ArrayBuffer
        ? item.content
        : new TextEncoder().encode(item.content);

      const hashBuffer = await crypto.subtle.digest("MD5", contentBuffer).catch(() => {
        // MD5 not always available, use SHA-256 as fallback
        return crypto.subtle.digest("SHA-256", contentBuffer);
      });

      const hashArray = Array.from(new Uint8Array(await hashBuffer));
      const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      manifestItems[item.identifier] = {
        hash,
        relpath: item.relpath,
        size_in_bytes: size,
        utc_timestamp: getCurrentTimestamp(),
      };
    }

    return {
      dtoolcore_version: "3.18.0",
      hash_function: "md5sum_hexdigest",
      items: manifestItems,
    };
  }

  /**
   * Upload JSON data to a signed URL
   */
  private async uploadJson(
    url: string,
    data: unknown,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await this.fetchImpl(url, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new DServerError("Failed to upload JSON", response.status);
    }
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
}
