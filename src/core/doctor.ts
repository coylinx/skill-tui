// Read-only diagnostics for Skill installations and their manifest.
import { agentSkillsDirs } from "./paths.js";
import { inventory } from "./inventory.js";
import { loadManifest } from "./manifest.js";
import type { DoctorIssue, DoctorReport, InstallManifest, InventoryItem } from "../types.js";

function issueFor(item: InventoryItem): DoctorIssue | undefined {
  if (item.status === "modified") {
    return { severity: "warning", code: "CONTENT_MODIFIED", message: item.issue ?? "目标内容已修改", path: item.targetPath };
  }
  if (item.status === "unmanaged") {
    return { severity: "warning", code: "UNMANAGED_SKILL", message: "发现未由 skilltui 记录的 Skill", path: item.targetPath };
  }
  if (item.status === "missing") {
    return { severity: "error", code: "MISSING_TARGET", message: item.issue ?? "目标不存在", path: item.targetPath };
  }
  if (item.status === "invalid") {
    return { severity: "error", code: "INVALID_SKILL", message: item.issue ?? "Skill 无效", path: item.targetPath };
  }
  return undefined;
}

export function doctor(manifest?: InstallManifest, roots: Record<string, string> = agentSkillsDirs): DoctorReport {
  const issues: DoctorIssue[] = [];
  let checked = 0;
  try {
    const loaded = manifest ?? loadManifest();
    const items = inventory(loaded, roots);
    checked = items.length;
    for (const item of items) {
      const issue = issueFor(item);
      if (issue) issues.push(issue);
    }
    for (const record of loaded.installations) {
      const root = roots[record.agent];
      if (!root) {
        issues.push({ severity: "error", code: "UNKNOWN_AGENT", message: `记录引用未知 Agent：${record.agent}`, path: record.targetPath });
      }
    }
  } catch (error) {
    issues.push({ severity: "error", code: "MANIFEST_INVALID", message: error instanceof Error ? error.message : String(error) });
  }
  return { schemaVersion: 1, ok: issues.length === 0, checked, issues };
}
