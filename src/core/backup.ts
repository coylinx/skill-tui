// Backup + restore for overwrite operations.
// Before overwriting an installed skill, copy it to:
//   ~/.skill-tui/backup/<agent>/<skillName>/<YYYYMMDD-HHMMSS>/
// and record metadata in ~/.skill-tui/backup/index.json so the result
// screen can offer a restore.

import { existsSync, cpSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { backupDir, backupIndexFile } from "./paths.js";
import { canonicalPath, installationId, validateInstallation, withManifestLock } from "./manifest.js";
import { parseSkillFile } from "./frontmatter.js";
import { removeQuietly, replaceTarget, tempSibling } from "./transaction.js";
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
  const tmp = `${backupIndexFile}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(records, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(tmp, backupIndexFile);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
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
  const ts = `${timestamp()}-${randomUUID()}`;
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
  withManifestLock((manifest, commit) => {
    const id = installationId(record.agent, record.originalPath);
    const installations = manifest.installations.filter((item) => item.id !== id);
    if (record.installation) {
      validateInstallation(record.installation);
      if (record.installation.id !== id || canonicalPath(record.installation.targetPath) !== canonicalPath(record.originalPath)) {
        throw new Error("备份记录与恢复目标不匹配");
      }
      installations.push(record.installation);
    }
    const staged = tempSibling(record.originalPath, "stage");
    try {
      mkdirSync(path.dirname(staged), { recursive: true });
      cpSync(record.backupPath, staged, { recursive: true, force: false });
      parseSkillFile(path.join(staged, "SKILL.md"));
      // The live version stays available until the manifest commit succeeds.
      replaceTarget(staged, record.originalPath, () => commit({ schemaVersion: 1, installations }));
    } finally { removeQuietly(staged); }
  });
}

/** List recent backups, newest first. */
export function recentBackups(limit = 20): BackupRecord[] {
  return loadBackupIndex()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
