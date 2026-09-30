// Safe removal for manifest-managed installations. Planning is pure; execution
// requires an explicit caller decision and keeps a backup before deletion.
import * as fs from "node:fs";
import { backupExisting } from "./backup.js";
import { loadManifest, withManifestLock } from "./manifest.js";
import { tempSibling } from "./transaction.js";
import type { AgentId, InstallationRecord } from "../types.js";

export type RemoveAction = "remove" | "missing";

export interface RemovePlanItem {
  record: InstallationRecord;
  action: RemoveAction;
  exists: boolean;
}

export interface RemoveResult {
  id: string;
  targetPath: string;
  status: "done" | "missing" | "failed";
  backupPath?: string;
  message?: string;
}

export function findInstallations(query: string, agent?: AgentId, manifest = loadManifest()): InstallationRecord[] {
  return manifest.installations.filter((record) =>
    (!agent || record.agent === agent) &&
    (record.installName === query || record.skillId === query || record.source.relativePath === query),
  );
}

export function planRemoval(records: InstallationRecord[]): RemovePlanItem[] {
  return records.map((record) => ({ record, exists: fs.existsSync(record.targetPath), action: fs.existsSync(record.targetPath) ? "remove" : "missing" }));
}

export function removeInstallation(record: InstallationRecord): RemoveResult {
  try {
    return withManifestLock((manifest, commit) => {
      const current = manifest.installations.find((item) => item.id === record.id);
      if (!current) throw new Error("安装记录已不存在，请重新执行 list");
      if (!fs.existsSync(current.targetPath)) {
        commit({ schemaVersion: 1, installations: manifest.installations.filter((item) => item.id !== current.id) });
        return { id: current.id, targetPath: current.targetPath, status: "missing", message: "目标已不存在，已清理记录" };
      }
      const backupPath = backupExisting(current.agent, current.installName, current.targetPath, current);
      if (!backupPath) throw new Error("删除前备份失败：目标目录不存在");
      const rollbackPath = tempSibling(current.targetPath, "rollback");
      let moved = false;
      try {
        fs.renameSync(current.targetPath, rollbackPath);
        moved = true;
        commit({ schemaVersion: 1, installations: manifest.installations.filter((item) => item.id !== current.id) });
      } catch (error) {
        if (moved) {
          try { fs.renameSync(rollbackPath, current.targetPath); }
          catch (rollbackError) { throw new Error(`${(error as Error).message}；自动回滚失败：${(rollbackError as Error).message}`); }
        }
        throw error;
      }
      try { fs.rmSync(rollbackPath, { recursive: true, force: true }); }
      catch (error) {
        return { id: current.id, targetPath: current.targetPath, status: "done", backupPath,
          message: `已删除，但临时目录清理失败：${(error as Error).message}` };
      }
      return { id: current.id, targetPath: current.targetPath, status: "done", backupPath };
    });
  } catch (error) {
    return { id: record.id, targetPath: record.targetPath, status: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}

export function removeInstallations(records: InstallationRecord[]): RemoveResult[] {
  return records.map(removeInstallation);
}
