// Importer: plan (preview) + execute (copy with backup).
//
// plan()  — pure, no writes. Computes for each task whether the target
//           exists and what action will be taken. Drives the preview screen
//           and is reused by --dry-run.
//
// importTask() — performs the copy. For overwrite mode it backs up the
//           existing dir first (unless noBackup). All agents are Tier-1:
//           pure directory copy, no extra wiring needed.

import { existsSync, cpSync } from "node:fs";
import path from "node:path";
import { skillTargetPath } from "./paths.js";
import { backupExisting } from "./backup.js";
import { parseSkillFile } from "./frontmatter.js";
import { pathExists, replaceDirectory } from "./directory.js";
import type { ImportResult, ImportTask, OverwriteMode, PlanItem } from "../types.js";

const SKIP_DIRS = new Set([".git", "node_modules"]);

/** Recursively copy a skill directory, skipping .git / node_modules. */
function copySkillDir(src: string, dest: string): void {
  cpSync(src, dest, {
    recursive: true,
    force: true,
    verbatimSymlinks: true,
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

/** Compute a plan for all tasks without writing anything. */
export function plan(
  tasks: ImportTask[],
  overwrite: boolean,
  noBackup: boolean,
): PlanItem[] {
  return tasks.map(({ skill, agent }) => {
    const installName = skill.installName ?? skill.name;
    const targetPath = skillTargetPath(agent, installName);
    const exists = pathExists(targetPath);
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
  const exists = pathExists(targetPath);

  // Case 2: target exists + not overwrite → skip.
  if (exists && !opts.overwrite) {
    return {
      status: "skipped",
      targetPath,
      action: "skip",
      message: "已存在（未覆盖）",
    };
  }

  const action = exists ? "overwrite" : "skip";
  let backupPath: string | undefined;
  try {
    replaceDirectory(skill.dir, targetPath, {
      copy: copySkillDir,
      validate(staged) {
        if (!validateTarget(staged)) throw new Error("导入校验失败：SKILL.md 缺失或无法解析");
      },
      beforeReplace() {
        if (exists && !opts.noBackup) {
          try {
            backupPath = backupExisting(agent, installName, targetPath) ?? undefined;
          } catch (error) {
            throw new Error(`备份失败：${errMsg(error)}`);
          }
        }
      },
    });
    return { status: "done", targetPath, action, backupPath };
  } catch (e) {
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
