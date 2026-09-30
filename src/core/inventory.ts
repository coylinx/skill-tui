// Read-only reconciliation between the installation manifest and the agent
// directories on disk. Inventory never mutates a target or the manifest.
import * as fs from "node:fs";
import path from "node:path";
import { agentSkillsDirs } from "./paths.js";
import { loadManifest, canonicalPath, contentHash, snapshotFiles } from "./manifest.js";
import { parseSkillFile } from "./frontmatter.js";
import type { AgentId, InstallationRecord, InventoryItem, InventoryStatus } from "../types.js";

export const AGENT_IDS = Object.keys(agentSkillsDirs) as AgentId[];

function isDirectory(value: string): boolean {
  try { return fs.lstatSync(value).isDirectory(); }
  catch { return false; }
}

function hasSkillFile(value: string): boolean {
  try { return fs.statSync(path.join(value, "SKILL.md")).isFile(); }
  catch { return false; }
}

function recordByPath(records: InstallationRecord[]): Map<string, InstallationRecord> {
  return new Map(records.map((record) => [canonicalPath(record.targetPath), record]));
}

function inspectDirectory(agent: AgentId, targetPath: string, record?: InstallationRecord): InventoryItem {
  const installName = path.basename(targetPath);
  if (!isDirectory(targetPath)) {
    return { status: record ? "missing" : "invalid", agent, installName, targetPath,
      record, issue: record ? "manifest 记录存在，但目标目录不存在" : "目标不是目录" };
  }
  if (!hasSkillFile(targetPath)) {
    return { status: "invalid", agent, installName, targetPath, record,
      issue: "目标目录缺少 SKILL.md" };
  }
  try { parseSkillFile(path.join(targetPath, "SKILL.md")); }
  catch (error) {
    return { status: "invalid", agent, installName, targetPath, record,
      issue: `SKILL.md 无法解析：${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    const hash = contentHash(snapshotFiles(targetPath));
    if (!record) return { status: "unmanaged", agent, installName, targetPath, contentHash: hash };
    if (hash !== record.contentHash) {
      return { status: "modified", agent, installName, targetPath, record, contentHash: hash,
        issue: "目标内容与 manifest 中的安装摘要不一致" };
    }
    return { status: "managed", agent, installName, targetPath, record, contentHash: hash };
  } catch (error) {
    return { status: "invalid", agent, installName, targetPath, record,
      issue: error instanceof Error ? error.message : String(error) };
  }
}

export function inventory(manifest = loadManifest(), roots: Record<string, string> = agentSkillsDirs): InventoryItem[] {
  const byPath = recordByPath(manifest.installations);
  const items: InventoryItem[] = [];
  for (const record of manifest.installations) {
    const agent = record.agent as AgentId;
    items.push(inspectDirectory(agent, record.targetPath, record));
  }
  for (const agent of Object.keys(roots) as AgentId[]) {
    const root = roots[agent];
    if (!isDirectory(root)) continue;
    let entries: string[];
    try { entries = fs.readdirSync(root).sort(); }
    catch { continue; } // doctor adds a targeted permission issue when needed
    for (const entry of entries) {
      const targetPath = path.join(root, entry);
      if (!isDirectory(targetPath)) continue;
      const key = canonicalPath(targetPath);
      if (byPath.has(key)) continue;
      // Only Skill-shaped directories belong in the inventory. Other agent
      // configuration folders are deliberately ignored.
      if (hasSkillFile(targetPath)) items.push(inspectDirectory(agent, targetPath));
    }
  }
  return items.sort((a, b) => a.agent.localeCompare(b.agent) || a.installName.localeCompare(b.installName));
}

export function inventorySummary(items: InventoryItem[]): Record<InventoryStatus, number> {
  const summary: Record<InventoryStatus, number> = {
    managed: 0, modified: 0, unmanaged: 0, missing: 0, invalid: 0,
  };
  for (const item of items) summary[item.status] += 1;
  return summary;
}
