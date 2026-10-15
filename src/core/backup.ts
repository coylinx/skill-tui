// Backup + restore for overwrite operations.
// Before overwriting an installed skill, copy it to:
//   ~/.skill-tui/backup/<agent>/<skillName>/<YYYYMMDD-HHMMSS>/
// and record metadata in ~/.skill-tui/backup/index.json so the result
// screen can offer a restore.

import { existsSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backupDir, backupIndexFile } from "./paths.js";
import type { AgentId } from "../types.js";
import { replaceDirectory } from "./directory.js";

export interface BackupRecord {
  id: string; // <agent>/<skillName>/<timestamp>
  agent: AgentId;
  skillName: string;
  timestamp: string;
  originalPath: string;
  backupPath: string;
  createdAt: number;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function loadBackupIndex(): BackupRecord[] {
  try {
    if (!existsSync(backupIndexFile)) return [];
    const records = JSON.parse(readFileSync(backupIndexFile, "utf8"));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function saveBackupIndex(records: BackupRecord[]): void {
  mkdirSync(backupDir, { recursive: true });
  writeFileSync(backupIndexFile, JSON.stringify(records, null, 2), "utf8");
}

/**
 * Back up an existing skill directory before it gets overwritten.
 * Returns the backup path, or null if there was nothing to back up.
 */
export function backupExisting(
  agent: AgentId,
  skillName: string,
  originalPath: string,
): string | null {
  if (!existsSync(originalPath)) return null;
  const parent = path.join(backupDir, agent, skillName);
  mkdirSync(parent, { recursive: true });
  const backupPath = mkdtempSync(path.join(parent, `${timestamp()}-`));
  const ts = path.basename(backupPath);
  cpSync(originalPath, backupPath, { recursive: true, force: true, verbatimSymlinks: true });

  const record: BackupRecord = {
    id: `${agent}/${skillName}/${ts}`,
    agent,
    skillName,
    timestamp: ts,
    originalPath,
    backupPath,
    createdAt: Date.now(),
  };
  const records = loadBackupIndex();
  records.push(record);
  // keep the index bounded — most recent 200
  saveBackupIndex(records.slice(-200));
  return backupPath;
}

/** Restore a backup record to its original location. */
export function restoreBackup(record: BackupRecord): void {
  if (!existsSync(record.backupPath)) {
    throw new Error(`备份不存在: ${record.backupPath}`);
  }
  replaceDirectory(record.backupPath, record.originalPath);
}

/** List recent backups, newest first. */
export function recentBackups(limit = 20): BackupRecord[] {
  return loadBackupIndex()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
