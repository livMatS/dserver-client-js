/**
 * Utility functions for dserver client
 */

/**
 * Generate a SHA-1 hash of a string (item identifier from relpath)
 * Uses the Web Crypto API which is available in browsers and Node.js 18+
 */
export async function generateIdentifier(relpath: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(relpath);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers and Node.js 19+)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * URL-encode a URI for use in API paths
 */
export function encodeUri(uri: string): string {
  return encodeURIComponent(uri);
}

/**
 * Get current Unix timestamp
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Parse ISO timestamp to Unix timestamp
 */
export function parseISOTimestamp(isoString: string): number {
  return Math.floor(new Date(isoString).getTime() / 1000);
}

/**
 * Check if a signed URL has expired
 */
export function isExpired(expiryTimestamp: string): boolean {
  const expiry = parseISOTimestamp(expiryTimestamp);
  const now = getCurrentTimestamp();
  return now >= expiry;
}

/**
 * Calculate remaining time until expiry in seconds
 */
export function timeUntilExpiry(expiryTimestamp: string): number {
  const expiry = parseISOTimestamp(expiryTimestamp);
  const now = getCurrentTimestamp();
  return Math.max(0, expiry - now);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Create a delay promise (useful for rate limiting)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
  } = options;

  let lastError: Error | undefined;
  let currentDelay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        await delay(currentDelay);
        currentDelay = Math.min(currentDelay * backoffFactor, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Run promises with concurrency limit
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p as unknown as R);

    if (limit <= items.length) {
      const e = p.then(() => {
        executing.splice(executing.indexOf(e), 1);
      });
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}
