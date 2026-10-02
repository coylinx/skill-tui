// Update planning and execution. Planning fetches sources and calculates a
// diff; only applyUpdatePlan invokes the existing importer write boundary.
import { inventory } from "./inventory.js";
import { loadManifest } from "./manifest.js";
import { diffFiles } from "./diff.js";
import { materializeSource, type MaterializedSource } from "./source.js";
import { snapshotFiles } from "./manifest.js";
import { importTask } from "./importer.js";
import type { AgentId, ImportResult, UpdatePlanItem } from "../types.js";

export interface PreparedUpdate {
  item: UpdatePlanItem;
  source?: MaterializedSource;
}

export async function planUpdates(query?: string, agent?: AgentId): Promise<PreparedUpdate[]> {
  const manifest = loadManifest();
  const records = manifest.installations.filter((record) =>
    (!agent || record.agent === agent) && (!query || record.installName === query || record.skillId === query || record.source.relativePath === query));
  const currentById = new Map(inventory(manifest).filter((entry) => entry.record).map((entry) => [entry.record!.id, entry]));
  const planned: PreparedUpdate[] = [];
  for (const record of records) {
    const current = currentById.get(record.id);
    if (!current || current.status === "missing") {
      try {
        const source = await materializeSource(record);
        planned.push({ source, item: { record, status: "missing", changes: [], sourceCommit: source.commit, message: "目标目录不存在，可重新安装" } });
      } catch (error) {
        planned.push({ item: { record, status: "missing", changes: [], message: "目标目录不存在；" + (error instanceof Error ? error.message : String(error)) } });
      }
      continue;
    }
    if (current.status === "invalid") {
      planned.push({ item: { record, status: "modified", currentHash: current.contentHash, changes: [], message: current.issue ?? "目标内容无效，无法安全更新" } });
      continue;
    }
    if (current.status === "modified") {
      try {
        const source = await materializeSource(record);
        const after = snapshotFiles(source.skill.dir);
        planned.push({ source, item: { record, status: "modified", currentHash: current.contentHash, sourceCommit: source.commit, changes: diffFiles(record.files, after), message: current.issue ?? "目标已被本地修改" } });
      } catch (error) {
        planned.push({ item: { record, status: "modified", currentHash: current.contentHash, changes: [], message: current.issue ?? (error instanceof Error ? error.message : String(error)) } });
      }
      continue;
    }
    try {
      const source = await materializeSource(record);
      const after = snapshotFiles(source.skill.dir);
      const changes = diffFiles(record.files, after);
      planned.push({ source, item: { record, status: changes.length ? "update" : "current", currentHash: record.contentHash, sourceCommit: source.commit, changes,
        message: changes.length ? undefined : "目标已经是来源的当前内容" } });
    } catch (error) {
      planned.push({ item: { record, status: "unavailable", changes: [], message: error instanceof Error ? error.message : String(error) } });
    }
  }
  return planned;
}

export function applyUpdatePlan(plans: PreparedUpdate[], force = false): ImportResult[] {
  const results: ImportResult[] = [];
  for (const plan of plans) {
    const canApply = plan.item.status === "update" || plan.item.status === "missing" || (force && plan.item.status === "modified");
    if (!plan.source || !canApply) {
      results.push({ status: "skipped", targetPath: plan.item.record.targetPath, action: "skip", message: plan.item.message ?? `状态：${plan.item.status}` });
      continue;
    }
    results.push(importTask({ skill: plan.source.skill, agent: plan.item.record.agent }, { overwrite: true, noBackup: false }));
  }
  return results;
}

export function disposeUpdatePlans(plans: PreparedUpdate[]): void {
  for (const plan of plans) plan.source?.cleanup();
}

export function updateSummary(plans: PreparedUpdate[]): Record<UpdatePlanItem["status"], number> {
  const summary = { update: 0, current: 0, modified: 0, missing: 0, unavailable: 0 } satisfies Record<UpdatePlanItem["status"], number>;
  for (const plan of plans) summary[plan.item.status] += 1;
  return summary;
}
