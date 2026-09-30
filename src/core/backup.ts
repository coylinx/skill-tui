// Backup + restore for overwrite operations.
// Before overwriting an installed skill, copy it to:
//   ~/.skill-tui/backup/<agent>/<skillName>/<YYYYMMDD-HHMMSS>/
// and record metadata in ~/.skill-tui/backup/index.json so the result
// screen can offer a restore.

import { existsSync, rmSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backupDir, backupIndexFile } from "./paths.js";
import { installationId, withManifestLock } from "./manifest.js";
import type { AgentId, InstallationRecord } from "../types.js";

export interface BackupRecord {
  id: string; // <agent>/<skillName>/<timestamp>
  agent: AgentId;
  skillName: string;
  timestamp: string;
  originalPath: string;
  backupPath: string;
  createdAt: number;
  /** The record that was replaced, if the target was manifest-managed. */
  installation?: InstallationRecord;
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function loadBackupIndex(): BackupRecord[] {
  try {
    if (!existsSync(backupIndexFile)) return [];
    return JSON.parse(readFileSync(backupIndexFile, "utf8")) as BackupRecord[];
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
  installation?: InstallationRecord,
): string | null {
  if (!existsSync(originalPath)) return null;
  const ts = timestamp();
  const backupPath = path.join(backupDir, agent, skillName, ts);
  mkdirSync(backupPath, { recursive: true });
  cpSync(originalPath, backupPath, { recursive: true, force: true });

  const record: BackupRecord = {
    id: `${agent}/${skillName}/${ts}`,
    agent,
    skillName,
    timestamp: ts,
    originalPath,
    backupPath,
    createdAt: Date.now(),
    installation,
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
  mkdirSync(path.dirname(record.originalPath), { recursive: true });
  rmSync(record.originalPath, { recursive: true, force: true });
  cpSync(record.backupPath, record.originalPath, { recursive: true, force: true });
  // Restore the metadata that described the backed-up content. If the old
  // target was unmanaged, remove the current managed record instead of
  // inventing provenance for a manually installed directory.
  withManifestLock((manifest, commit) => {
    const id = installationId(record.agent, record.originalPath);
    const installations = manifest.installations.filter((item) => item.id !== id);
    if (record.installation) installations.push(record.installation);
    commit({ schemaVersion: 1, installations });
  });
}

/** List recent backups, newest first. */
export function recentBackups(limit = 20): BackupRecord[] {
  return loadBackupIndex()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
