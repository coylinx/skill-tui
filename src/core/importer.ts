// Importer: plan (preview) + execute (copy with backup).
//
// plan()  — pure, no writes. Computes for each task whether the target
//           exists and what action will be taken. Drives the preview screen
//           and is reused by --dry-run.
//
// importTask() — performs the copy. For overwrite mode it backs up the
//           existing dir first (unless noBackup). All agents are Tier-1:
//           pure directory copy, no extra wiring needed.

import { existsSync, rmSync, cpSync, mkdirSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { skillTargetPath } from "./paths.js";
import { backupExisting } from "./backup.js";
import { parseSkillFile } from "./frontmatter.js";
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

function tempSibling(targetPath: string, purpose: "stage" | "rollback"): string {
  const parent = path.dirname(targetPath);
  const name = path.basename(targetPath);
  return path.join(parent, `.${name}.skill-tui-${purpose}-${process.pid}-${randomUUID()}`);
}

function removeQuietly(targetPath: string | undefined): void {
  if (!targetPath) return;
  try {
    rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup. The original operation's error is more useful.
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
  const exists = existsSync(targetPath);

  // Case 1: target absent → fresh install.
  if (!exists) {
    let stagedPath: string | undefined;
    try {
      stagedPath = stageSkill(skill.dir, targetPath);
      renameSync(stagedPath, targetPath);
      stagedPath = undefined;
      return { status: "done", targetPath, action: "skip" };
    } catch (e) {
      removeQuietly(stagedPath);
      return {
        status: "failed",
        targetPath,
        action: "skip",
        message: errMsg(e),
      };
    }
  }

  // Case 2: target exists + not overwrite → skip.
  if (!opts.overwrite) {
    return {
      status: "skipped",
      targetPath,
      action: "skip",
      message: "已存在（未覆盖）",
    };
  }

  // Case 3: target exists + overwrite → stage, backup, then atomically swap.
  // The original stays in a temporary sibling until the staged copy is live,
  // so even --no-backup can roll back a failed replacement.
  let stagedPath: string;
  try {
    stagedPath = stageSkill(skill.dir, targetPath);
  } catch (e) {
    return {
      status: "failed",
      targetPath,
      action: "overwrite",
      message: errMsg(e),
    };
  }

  let backupPath: string | undefined;
  if (!opts.noBackup) {
    try {
      backupPath = backupExisting(agent, installName, targetPath) ?? undefined;
    } catch (e) {
      removeQuietly(stagedPath);
      return {
        status: "failed",
        targetPath,
        action: "overwrite",
        message: `备份失败：${errMsg(e)}`,
      };
    }
  }

  const rollbackPath = tempSibling(targetPath, "rollback");
  let originalMoved = false;
  try {
    renameSync(targetPath, rollbackPath);
    originalMoved = true;
    renameSync(stagedPath, targetPath);
    stagedPath = "";
  } catch (e) {
    removeQuietly(stagedPath);
    if (originalMoved) {
      try {
        removeQuietly(targetPath);
        renameSync(rollbackPath, targetPath);
        originalMoved = false;
      } catch (rollbackError) {
        return {
          status: "failed",
          targetPath,
          action: "overwrite",
          backupPath,
          message: `${errMsg(e)}；自动回滚失败：${errMsg(rollbackError)}`,
        };
      }
    }
    return {
      status: "failed",
      targetPath,
      action: "overwrite",
      backupPath,
      message: errMsg(e),
    };
  }

  try {
    rmSync(rollbackPath, { recursive: true, force: true });
  } catch (e) {
    return {
      status: "done",
      targetPath,
      action: "overwrite",
      backupPath,
      message: `导入成功，但临时旧版本清理失败：${errMsg(e)}`,
    };
  }
  return { status: "done", targetPath, action: "overwrite", backupPath };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
