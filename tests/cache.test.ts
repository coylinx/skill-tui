// Tests for cache pruning: old dirs removed, fresh dirs kept.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readdirSync, utimesSync } from "node:fs";
import path from "node:path";
import { pruneCache } from "../src/core/cache.js";
import { cacheDir } from "../src/core/paths.js";

// tests/setup.ts isolates the actual home and cache paths.
describe("pruneCache on a temp dir", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = cacheDir;
    mkdirSync(tmp, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("removes entries older than the default two hours and keeps fresh ones", () => {
    const oldDir = path.join(tmp, "old-repo");
    const freshDir = path.join(tmp, "fresh-repo");
    mkdirSync(oldDir, { recursive: true });
    mkdirSync(freshDir, { recursive: true });
    writeFileSync(path.join(oldDir, "x"), "x");
    writeFileSync(path.join(freshDir, "x"), "x");

    // Set oldDir mtime to 3 hours ago, freshDir to 1 hour ago.
    const now = Date.now();
    const threeHoursAgo = (now - 3 * 3600000) / 1000;
    const oneHourAgo = (now - 1 * 3600000) / 1000;
    utimesSync(oldDir, threeHoursAgo, threeHoursAgo);
    utimesSync(freshDir, oneHourAgo, oneHourAgo);

    const result = pruneCache();
    expect(result.removed).toEqual(["old-repo"]);
    expect(result.kept).toEqual(["fresh-repo"]);
    expect(readdirSync(tmp)).toEqual(["fresh-repo"]);
  });

  it("handles an absent cache directory", () => {
    rmSync(cacheDir, { recursive: true, force: true });
    expect(pruneCache()).toEqual({ removed: [], kept: [] });
  });
});
