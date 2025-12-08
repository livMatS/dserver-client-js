# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.1.0] - 2025-12-08

Initial release of the dserver TypeScript/JavaScript client.

### Added

- Core `DServerClient` class for interacting with dserver API
- Authentication support with JWT tokens
- Dataset operations:
  - `listDatasets()` - List datasets with optional filtering
  - `getDataset(uri)` - Get dataset metadata
  - `searchDatasets(query)` - Search datasets by text query
  - `getManifest(uri)` - Get dataset manifest
  - `getReadme(uri)` - Get dataset README content
- Signed URL operations:
  - `getSignedUrls(uri)` - Get signed URLs for reading a dataset
  - `getItemSignedUrl(uri, identifier)` - Get signed URL for a single item
  - `initiateUpload(baseUri, metadata)` - Initiate dataset upload
  - `completeUpload(uri)` - Complete dataset upload
- Tag operations:
  - `getTags(uri)` - Get dataset tags
  - `addTag(uri, tag)` - Add tag to dataset
  - `deleteTag(uri, tag)` - Remove tag from dataset
- Annotation operations:
  - `getAnnotations(uri)` - Get dataset annotations
  - `getAnnotation(uri, name)` - Get specific annotation
  - `setAnnotation(uri, name, value)` - Set annotation value
  - `deleteAnnotation(uri, name)` - Delete annotation
- Vue.js composables for reactive state management:
  - `useDServer()` - Main composable for dserver operations
  - `useDatasets()` - Composable for dataset listing
  - `useDataset(uri)` - Composable for single dataset
- TypeScript type definitions for all API responses
- Support for both CommonJS and ES Module imports
- Comprehensive error handling with typed exceptions

### Dependencies

- Requires Node.js >= 18.0.0
- Optional peer dependency on Vue.js >= 3.0.0 for composables
