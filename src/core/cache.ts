// Cache maintenance: prune cloned repos older than the max age.
// Runs on startup so disk usage from ~/.skill-tui/cache/ stays bounded.
// Default max age: 2 hours.

import { existsSync, readdirSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { cacheDir } from "./paths.js";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export interface PruneResult {
  removed: string[];
  kept: string[];
}

/**
 * Remove cache subdirectories whose mtime is older than `maxAgeMs`.
 * Best-effort: errors on individual entries are swallowed (logged to nothing)
 * so a startup prune can never block the app.
 */
export function pruneCache(maxAgeMs = TWO_HOURS_MS): PruneResult {
  const removed: string[] = [];
  const kept: string[] = [];
  if (!existsSync(cacheDir)) return { removed, kept };
  const now = Date.now();
  let entries: string[];
  try {
    entries = readdirSync(cacheDir);
  } catch {
    return { removed, kept };
  }
  for (const entry of entries) {
    const dir = path.join(cacheDir, entry);
    let mtime: number;
    try {
      mtime = statSync(dir).mtimeMs;
    } catch {
      continue; // can't stat, leave it alone
    }
    if (now - mtime > maxAgeMs) {
      try {
        rmSync(dir, { recursive: true, force: true });
        removed.push(entry);
      } catch {
        kept.push(entry); // failed to remove — keep tracking
      }
    } else {
      kept.push(entry);
    }
  }
  return { removed, kept };
}
