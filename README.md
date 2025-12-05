# dserver-client

TypeScript/JavaScript client for the dserver signed URL API. Enables web applications to download and upload datasets through dserver without requiring direct storage backend credentials.

## Features

- **Download datasets** using signed URLs
- **Upload new datasets** with progress tracking
- **TypeScript-first** with full type definitions
- **Browser and Node.js** compatible
- **Zero dependencies** (uses native `fetch`)
- **Progress callbacks** for large file operations
- **Cancellation support** via AbortController

## Installation

```bash
npm install dserver-client
```

## Quick Start

### Reading a Dataset

```typescript
import { DServerClient } from 'dserver-client';

// Initialize client with your dserver URL and JWT token
const client = new DServerClient({
  baseUrl: 'http://localhost:5000',
  token: 'your-jwt-token'
});

// Get signed URLs for a dataset
const urls = await client.getDatasetSignedUrls('s3://bucket/dataset-uuid');

// Download the manifest
const manifest = await client.downloadManifest(urls);
console.log('Items:', Object.keys(manifest.items).length);

// Download a specific item
const itemId = Object.keys(manifest.items)[0];
const content = await client.downloadItem(urls, itemId, {
  onProgress: (loaded, total) => {
    console.log(`Progress: ${Math.round(loaded/total*100)}%`);
  }
});

// Content is an ArrayBuffer - convert as needed
const text = new TextDecoder().decode(content);
```

### Uploading a Dataset

```typescript
import { DServerClient } from 'dserver-client';

const client = new DServerClient({
  baseUrl: 'http://localhost:5000',
  token: 'your-jwt-token'
});

// Prepare files to upload
const files = [
  {
    relpath: 'data/experiment1.csv',
    content: 'id,value\n1,100\n2,200',
    contentType: 'text/csv'
  },
  {
    relpath: 'data/experiment2.csv',
    content: await fetch('/local/file.csv').then(r => r.blob())
  }
];

// Create and upload the dataset
const result = await client.createDataset(
  's3://my-bucket',
  'my-experiment-data',
  files,
  {
    readme: '---\ndescription: Experiment results\nauthor: Jane Doe\n',
    onProgress: (uploaded, total, currentFile) => {
      console.log(`Uploading ${currentFile}: ${Math.round(uploaded/total*100)}%`);
    }
  }
);

console.log('Dataset created:', result.uri);
```

## API Reference

### `DServerClient`

The main client class for interacting with dserver.

#### Constructor

```typescript
const client = new DServerClient({
  baseUrl: string,      // dserver URL (e.g., "http://localhost:5000")
  token?: string,       // JWT authentication token
  fetch?: typeof fetch  // Optional custom fetch implementation
});
```

#### Methods

##### `getDatasetSignedUrls(uri: string): Promise<DatasetSignedURLsResponse>`

Get signed URLs for reading all components of a dataset.

```typescript
const urls = await client.getDatasetSignedUrls('s3://bucket/uuid');
// urls.manifest_url, urls.readme_url, urls.item_urls, etc.
```

##### `getItemSignedUrl(uri: string, identifier: string): Promise<ItemSignedURLResponse>`

Get a signed URL for a single item (more efficient for single-item access).

```typescript
const itemUrl = await client.getItemSignedUrl('s3://bucket/uuid', 'abc123...');
```

##### `downloadItem(urls, identifier, options?): Promise<ArrayBuffer>`

Download an item using the signed URLs.

```typescript
const content = await client.downloadItem(urls, identifier, {
  onProgress: (loaded, total) => console.log(`${loaded}/${total}`),
  signal: abortController.signal
});
```

##### `downloadManifest(urls): Promise<Manifest>`

Download and parse the dataset manifest.

##### `downloadAdminMetadata(urls): Promise<AdminMetadata>`

Download and parse the admin metadata.

##### `downloadReadme(urls): Promise<string>`

Download the README as a string.

##### `createDataset(baseUri, name, files, options?): Promise<UploadCompleteResponse>`

Create and upload a new dataset.

```typescript
const result = await client.createDataset(
  's3://bucket',
  'my-dataset',
  [
    { relpath: 'file.txt', content: 'Hello World' }
  ],
  {
    readme: '---\ndescription: My dataset\n',
    onProgress: (uploaded, total, file) => { ... }
  }
);
```

### Types

#### `DatasetSignedURLsResponse`

```typescript
interface DatasetSignedURLsResponse {
  uri: string;
  expiry_seconds: number;
  expiry_timestamp: string;
  admin_metadata_url: string;
  manifest_url: string;
  readme_url: string;
  item_urls: Record<string, string>;
  overlay_urls: Record<string, string>;
  annotation_urls: Record<string, string>;
  tags: string[];
}
```

#### `FileToUpload`

```typescript
interface FileToUpload {
  relpath: string;                        // Path within dataset
  content: Blob | ArrayBuffer | string;   // File content
  contentType?: string;                   // MIME type
}
```

#### `UploadOptions`

```typescript
interface UploadOptions {
  onProgress?: (loaded: number, total: number, item?: string) => void;
  signal?: AbortSignal;
  readme?: string;
  annotations?: Record<string, unknown>;
  tags?: string[];
}
```

### Utilities

The package exports several utility functions:

```typescript
import {
  generateIdentifier,  // Generate SHA-1 identifier from relpath
  generateUUID,        // Generate UUID v4
  encodeUri,           // URL-encode a URI
  isExpired,           // Check if signed URL has expired
  timeUntilExpiry,     // Seconds until expiry
  formatBytes,         // Human-readable byte size
  withRetry,           // Retry with exponential backoff
  parallelLimit        // Run promises with concurrency limit
} from 'dserver-client';
```

## Error Handling

The client throws typed errors for different failure cases:

```typescript
import {
  DServerError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError
} from 'dserver-client';

try {
  await client.getDatasetSignedUrls('s3://bucket/uuid');
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Token is invalid or expired
    console.log('Please log in again');
  } else if (error instanceof AuthorizationError) {
    // User doesn't have permission
    console.log('Access denied');
  } else if (error instanceof NotFoundError) {
    // Dataset doesn't exist
    console.log('Dataset not found');
  } else if (error instanceof DServerError) {
    // Other API error
    console.log('Error:', error.message, error.status);
  }
}
```

## Cancellation

Use `AbortController` to cancel long-running operations:

```typescript
const controller = new AbortController();

// Start download
const downloadPromise = client.downloadItem(urls, identifier, {
  signal: controller.signal
});

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await downloadPromise;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Download cancelled');
  }
}
```

## Vue.js Integration

Example Vue 3 composable for dataset operations:

```typescript
// composables/useDataset.ts
import { ref, computed } from 'vue';
import { DServerClient, DatasetSignedURLsResponse } from 'dserver-client';

export function useDataset(serverUrl: string) {
  const client = new DServerClient({ baseUrl: serverUrl });
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const urls = ref<DatasetSignedURLsResponse | null>(null);

  async function loadDataset(uri: string, token: string) {
    loading.value = true;
    error.value = null;
    client.setToken(token);

    try {
      urls.value = await client.getDatasetSignedUrls(uri);
    } catch (e) {
      error.value = e as Error;
    } finally {
      loading.value = false;
    }
  }

  async function downloadItem(identifier: string): Promise<Blob | null> {
    if (!urls.value) return null;

    const content = await client.downloadItem(urls.value, identifier);
    return new Blob([content]);
  }

  return {
    loading,
    error,
    urls,
    loadDataset,
    downloadItem
  };
}
```

## Browser Support

The client uses standard Web APIs:
- `fetch` - for HTTP requests
- `crypto.subtle` - for SHA-1 identifier generation
- `TextEncoder`/`TextDecoder` - for string encoding

Supported in all modern browsers (Chrome 63+, Firefox 57+, Safari 11.1+, Edge 79+).

For Node.js, requires version 18+ (for native fetch support).

## License

MIT
