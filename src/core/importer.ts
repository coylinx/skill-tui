// Importer: plan (preview) + execute (copy with backup).
//
// plan()  — pure, no writes. Computes for each task whether the target
//           exists and what action will be taken. Drives the preview screen
//           and is reused by --dry-run.
//
// importTask() — performs the copy. For overwrite mode it backs up the
//           existing dir first (unless noBackup). All agents are Tier-1:
//           pure directory copy, no extra wiring needed.

import { existsSync, cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { agentSkillsDirs, skillTargetPath } from "./paths.js";
import { backupExisting } from "./backup.js";
import { parseSkillFile } from "./frontmatter.js";
import { createInstallation, installationId, withManifestLock } from "./manifest.js";
import { tempSibling, removeQuietly, replaceTarget } from "./transaction.js";
import type { ImportResult, ImportTask, OverwriteMode, PlanItem } from "../types.js";

const SKIP_DIRS = new Set([".git", "node_modules"]);

/** Recursively copy a skill directory, skipping .git / node_modules. */
function copySkillDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (s) => {
      const base = path.basename(s);
      return !SKIP_DIRS.has(base);
    },
  });
}

/** Verify the destination has a parseable SKILL.md after copy. */
function validateTarget(targetPath: string): boolean {
  const file = path.join(targetPath, "SKILL.md");
  if (!existsSync(file)) return false;
  try {
    parseSkillFile(file);
    return true;
  } catch {
    return false;
  }
}

/** Copy and validate away from the live target before changing anything. */
function stageSkill(src: string, targetPath: string): string {
  const stagedPath = tempSibling(targetPath, "stage");
  try {
    copySkillDir(src, stagedPath);
    if (!validateTarget(stagedPath)) {
      throw new Error("导入后校验失败：SKILL.md 缺失或无法解析");
    }
    return stagedPath;
  } catch (err) {
    removeQuietly(stagedPath);
    throw err;
  }
}

/** Compute a plan for all tasks without writing anything. */
export function plan(
  tasks: ImportTask[],
  overwrite: boolean,
  noBackup: boolean,
): PlanItem[] {
  return tasks.map(({ skill, agent }) => {
    const installName = skill.installName ?? skill.name;
    const targetPath = skillTargetPath(agent, installName);
    const exists = existsSync(targetPath);
    let action: OverwriteMode;
    let backupPath: string | undefined;
    if (!exists) {
      action = "skip"; // "skip" here means "no conflict — just install"
    } else if (overwrite) {
      action = "overwrite";
      if (!noBackup) backupPath = undefined; // resolved at execute time
    } else {
      action = "skip"; // exists + not overwrite → leave it alone
    }
    return { skill, agent, targetPath, exists, action, backupPath };
  });
}

export interface ImportOptions {
  overwrite: boolean;
  noBackup: boolean;
}

/** Execute a single import task. Writes to disk. */
export function importTask(task: ImportTask, opts: ImportOptions): ImportResult {
  const { skill, agent } = task;
  const installName = skill.installName ?? skill.name;
  const targetPath = skillTargetPath(agent, installName);
  if (existsSync(targetPath) && !opts.overwrite) {
    return {
      status: "skipped",
      targetPath,
      action: "skip",
      message: "已存在（未覆盖）",
    };
  }

  let action: OverwriteMode = "skip";
  let stagedPath: string | undefined;
  let backupPath: string | undefined;
  try {
    if (!Object.hasOwn(agentSkillsDirs, agent) || !installName ||
      /[\\/:]/.test(installName) || [".", ".."].includes(installName)) {
      throw new Error("安装名必须是单个目录名");
    }
    return withManifestLock((doc, commit) => {
      // Recheck under the lock: another process may have installed this target.
      const exists = existsSync(targetPath);
      action = exists && opts.overwrite ? "overwrite" : "skip";
      if (exists && !opts.overwrite) {
        return { status: "skipped", targetPath, action, message: "已存在（未覆盖）" };
      }
      stagedPath = stageSkill(skill.dir, targetPath);
      const id = installationId(agent, targetPath);
      const previous = doc.installations.find((record) => record.id === id);
      const record = createInstallation(task, targetPath, stagedPath, previous);
      if (exists && !opts.noBackup) {
        backupPath = backupExisting(agent, installName, targetPath) ?? undefined;
      }
      const message = replaceTarget(stagedPath, targetPath, () => commit({
        schemaVersion: 1,
        installations: [...doc.installations.filter((old) => old.id !== id), record],
      }));
      stagedPath = undefined;
      return { status: "done", targetPath, action, backupPath, message };
    });
  } catch (e) {
    removeQuietly(stagedPath);
    return {
      status: "failed",
      targetPath,
      action,
      backupPath,
      message: errMsg(e),
    };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
