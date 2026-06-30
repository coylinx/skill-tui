// URL history persistence for the input screen (↑/↓ to recall).
// Stored as a small JSON array, newest first, capped at 20 entries.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dataRoot, historyFile } from "./paths.js";

const MAX = 20;

export async function loadHistory(): Promise<string[]> {
  try {
    if (!existsSync(historyFile)) return [];
    const raw = await readFile(historyFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function saveHistory(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  const prev = await loadHistory();
  const next = [trimmed, ...prev.filter((u) => u !== trimmed)].slice(0, MAX);
  try {
    await mkdir(dataRoot, { recursive: true });
    await writeFile(historyFile, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // best-effort; history is non-critical
  }
}
