/**
 * Vue 3 composables for dserver client
 *
 * These composables provide reactive wrappers around the DServerClient
 * for easy integration with Vue applications.
 */

import { ref, computed, Ref, shallowRef } from "vue";
import { DServerClient } from "./client";
import {
  DServerClientConfig,
  DatasetSignedURLsResponse,
  Manifest,
  AdminMetadata,
  UploadCompleteResponse,
  FileToUpload,
  UploadOptions,
  DownloadOptions,
  DServerError,
} from "./types";

/**
 * Composable for managing a DServerClient instance
 */
export function useDServerClient(config: Ref<DServerClientConfig> | DServerClientConfig) {
  const client = computed(() => {
    const cfg = "value" in config ? config.value : config;
    return new DServerClient(cfg);
  });

  return { client };
}

/**
 * Composable for downloading dataset items
 */
export function useDatasetDownload(client: Ref<DServerClient>) {
  const loading = ref(false);
  const error = shallowRef<Error | null>(null);
  const urls = shallowRef<DatasetSignedURLsResponse | null>(null);
  const manifest = shallowRef<Manifest | null>(null);
  const adminMetadata = shallowRef<AdminMetadata | null>(null);
  const readme = ref<string | null>(null);

  const progress = ref<{ loaded: number; total: number; item?: string }>({
    loaded: 0,
    total: 0,
  });

  /**
   * Load signed URLs for a dataset
   */
  async function loadDataset(uri: string): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      urls.value = await client.value.getDatasetSignedUrls(uri);
    } catch (e) {
      error.value = e as Error;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Load the manifest for the current dataset
   */
  async function loadManifest(): Promise<Manifest | null> {
    if (!urls.value) {
      throw new Error("No dataset loaded. Call loadDataset first.");
    }

    loading.value = true;
    error.value = null;

    try {
      manifest.value = await client.value.downloadManifest(urls.value);
      return manifest.value;
    } catch (e) {
      error.value = e as Error;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Load the admin metadata for the current dataset
   */
  async function loadAdminMetadata(): Promise<AdminMetadata | null> {
    if (!urls.value) {
      throw new Error("No dataset loaded. Call loadDataset first.");
    }

    loading.value = true;
    error.value = null;

    try {
      adminMetadata.value = await client.value.downloadAdminMetadata(urls.value);
      return adminMetadata.value;
    } catch (e) {
      error.value = e as Error;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Load the README for the current dataset
   */
  async function loadReadme(): Promise<string | null> {
    if (!urls.value) {
      throw new Error("No dataset loaded. Call loadDataset first.");
    }

    loading.value = true;
    error.value = null;

    try {
      readme.value = await client.value.downloadReadme(urls.value);
      return readme.value;
    } catch (e) {
      error.value = e as Error;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Download a specific item
   */
  async function downloadItem(
    identifier: string,
    options?: DownloadOptions
  ): Promise<ArrayBuffer> {
    if (!urls.value) {
      throw new Error("No dataset loaded. Call loadDataset first.");
    }

    loading.value = true;
    error.value = null;
    progress.value = { loaded: 0, total: 0, item: identifier };

    try {
      const result = await client.value.downloadItem(urls.value, identifier, {
        ...options,
        onProgress: (loaded, total, item) => {
          progress.value = { loaded, total, item };
          options?.onProgress?.(loaded, total, item);
        },
      });
      return result;
    } catch (e) {
      error.value = e as Error;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Download an item as a Blob for file saving
   */
  async function downloadItemAsBlob(
    identifier: string,
    mimeType?: string,
    options?: DownloadOptions
  ): Promise<Blob> {
    const content = await downloadItem(identifier, options);
    return new Blob([content], { type: mimeType });
  }

  /**
   * Download an item and trigger browser download
   */
  async function downloadItemToFile(
    identifier: string,
    filename: string,
    mimeType?: string,
    options?: DownloadOptions
  ): Promise<void> {
    const blob = await downloadItemAsBlob(identifier, mimeType, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get item details from manifest
   */
  function getItemDetails(identifier: string) {
    if (!manifest.value) return null;
    return manifest.value.items[identifier] || null;
  }

  /**
   * List all items
   */
  const items = computed(() => {
    if (!manifest.value) return [];
    return Object.entries(manifest.value.items).map(([id, item]) => ({
      identifier: id,
      ...item,
    }));
  });

  return {
    // State
    loading,
    error,
    urls,
    manifest,
    adminMetadata,
    readme,
    progress,
    items,

    // Actions
    loadDataset,
    loadManifest,
    loadAdminMetadata,
    loadReadme,
    downloadItem,
    downloadItemAsBlob,
    downloadItemToFile,
    getItemDetails,
  };
}

/**
 * Composable for uploading datasets
 */
export function useDatasetUpload(client: Ref<DServerClient>) {
  const loading = ref(false);
  const error = shallowRef<Error | null>(null);
  const progress = ref<{
    uploaded: number;
    total: number;
    currentFile?: string;
    phase: "preparing" | "uploading" | "finalizing" | "complete" | "error";
  }>({
    uploaded: 0,
    total: 0,
    phase: "preparing",
  });

  const result = shallowRef<UploadCompleteResponse | null>(null);

  /**
   * Upload a new dataset
   */
  async function uploadDataset(
    baseUri: string,
    name: string,
    files: FileToUpload[],
    options?: UploadOptions
  ): Promise<UploadCompleteResponse> {
    loading.value = true;
    error.value = null;
    result.value = null;
    progress.value = { uploaded: 0, total: 0, phase: "preparing" };

    try {
      progress.value.phase = "uploading";

      const uploadResult = await client.value.createDataset(
        baseUri,
        name,
        files,
        {
          ...options,
          onProgress: (uploaded, total, currentFile) => {
            progress.value = {
              uploaded,
              total,
              currentFile,
              phase: "uploading",
            };
            options?.onProgress?.(uploaded, total, currentFile);
          },
        }
      );

      progress.value.phase = "complete";
      result.value = uploadResult;
      return uploadResult;
    } catch (e) {
      progress.value.phase = "error";
      error.value = e as Error;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Upload files from a FileList (e.g., from file input)
   */
  async function uploadFromFileList(
    baseUri: string,
    name: string,
    fileList: FileList,
    basePath: string = "",
    options?: UploadOptions
  ): Promise<UploadCompleteResponse> {
    const files: FileToUpload[] = Array.from(fileList).map((file) => ({
      relpath: basePath ? `${basePath}/${file.name}` : file.name,
      content: file,
      contentType: file.type || undefined,
    }));

    return uploadDataset(baseUri, name, files, options);
  }

  /**
   * Upload files with drag-and-drop support
   */
  async function uploadFromDataTransfer(
    baseUri: string,
    name: string,
    dataTransfer: DataTransfer,
    options?: UploadOptions
  ): Promise<UploadCompleteResponse> {
    const files: FileToUpload[] = [];

    // Handle both files and directory entries
    if (dataTransfer.items) {
      for (const item of Array.from(dataTransfer.items)) {
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            await collectFiles(entry, "", files);
          } else {
            const file = item.getAsFile();
            if (file) {
              files.push({
                relpath: file.name,
                content: file,
                contentType: file.type || undefined,
              });
            }
          }
        }
      }
    } else {
      // Fallback for browsers without items API
      for (const file of Array.from(dataTransfer.files)) {
        files.push({
          relpath: file.name,
          content: file,
          contentType: file.type || undefined,
        });
      }
    }

    return uploadDataset(baseUri, name, files, options);
  }

  /**
   * Recursively collect files from a FileSystemEntry
   */
  async function collectFiles(
    entry: FileSystemEntry,
    basePath: string,
    files: FileToUpload[]
  ): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      files.push({
        relpath: basePath ? `${basePath}/${file.name}` : file.name,
        content: file,
        contentType: file.type || undefined,
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      const newBasePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      for (const childEntry of entries) {
        await collectFiles(childEntry, newBasePath, files);
      }
    }
  }

  const progressPercent = computed(() => {
    if (progress.value.total === 0) return 0;
    return Math.round((progress.value.uploaded / progress.value.total) * 100);
  });

  return {
    // State
    loading,
    error,
    progress,
    progressPercent,
    result,

    // Actions
    uploadDataset,
    uploadFromFileList,
    uploadFromDataTransfer,
  };
}

// Type declarations for FileSystem API
interface FileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: Error) => void
  ): void;
}
