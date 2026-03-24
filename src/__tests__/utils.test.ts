import { describe, it, expect } from "vitest";
import {
  generateUUID,
  encodeUri,
  getCurrentTimestamp,
  parseISOTimestamp,
  isExpired,
  timeUntilExpiry,
  formatBytes,
  chunk,
  generateIdentifier,
} from "../utils";

describe("generateUUID", () => {
  it("returns a string", () => {
    expect(typeof generateUUID()).toBe("string");
  });

  it("returns a UUID v4 format", () => {
    const uuid = generateUUID();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it("returns different values on successive calls", () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    expect(uuid1).not.toBe(uuid2);
  });
});

describe("encodeUri", () => {
  it("encodes spaces in URI", () => {
    const result = encodeUri("s3://my-bucket/my dataset");
    expect(result).not.toContain(" ");
  });

  it("encodes slashes", () => {
    const result = encodeUri("s3://bucket/path/to/file");
    expect(result).not.toContain("/");
  });

  it("returns a non-empty string", () => {
    expect(encodeUri("s3://bucket/dataset")).toBeTruthy();
  });
});

describe("generateIdentifier", () => {
  it("returns a string", async () => {
    const id = await generateIdentifier("data/file.txt");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same input", async () => {
    const id1 = await generateIdentifier("data/file.txt");
    const id2 = await generateIdentifier("data/file.txt");
    expect(id1).toBe(id2);
  });

  it("produces different identifiers for different paths", async () => {
    const id1 = await generateIdentifier("data/file1.txt");
    const id2 = await generateIdentifier("data/file2.txt");
    expect(id1).not.toBe(id2);
  });

  it("returns a hex string (SHA-1 = 40 chars)", async () => {
    const id = await generateIdentifier("data/file.txt");
    expect(id).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("getCurrentTimestamp", () => {
  it("returns a number", () => {
    expect(typeof getCurrentTimestamp()).toBe("number");
  });

  it("returns a Unix timestamp close to now", () => {
    const ts = getCurrentTimestamp();
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(ts - now)).toBeLessThan(2);
  });
});

describe("parseISOTimestamp", () => {
  it("parses a known ISO timestamp", () => {
    const ts = parseISOTimestamp("2024-01-01T00:00:00.000Z");
    expect(ts).toBe(1704067200);
  });

  it("returns a number", () => {
    expect(typeof parseISOTimestamp("2024-01-01T00:00:00Z")).toBe("number");
  });
});

describe("isExpired", () => {
  it("returns true for a past timestamp", () => {
    expect(isExpired("2000-01-01T00:00:00Z")).toBe(true);
  });

  it("returns false for a future timestamp", () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    expect(isExpired(future)).toBe(false);
  });
});

describe("timeUntilExpiry", () => {
  it("returns 0 for a past timestamp", () => {
    expect(timeUntilExpiry("2000-01-01T00:00:00Z")).toBe(0);
  });

  it("returns a positive number for a future timestamp", () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    expect(timeUntilExpiry(future)).toBeGreaterThan(0);
  });
});

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
  });

  it("formats gigabytes with decimals", () => {
    const result = formatBytes(1.5 * 1024 * 1024 * 1024);
    expect(result).toContain("GB");
  });
});

describe("chunk", () => {
  it("chunks an array into equal parts", () => {
    const result = chunk([1, 2, 3, 4, 5, 6], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it("handles arrays not evenly divisible", () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns single chunk when size >= array length", () => {
    const result = chunk([1, 2, 3], 10);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it("returns empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});
