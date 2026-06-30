// Importer: plan (preview) + execute (copy with backup & wiring).
//
// plan()  — pure, no writes. Computes for each task whether the target
//           exists and what action will be taken. Drives the preview screen
//           and is reused by --dry-run.
//
// importTask() — performs the copy. For overwrite mode it backs up the
//           existing dir first (unless noBackup). Handles Gemini's GEMINI.md
//           @-import wiring and OpenCode's optional config.

import { existsSync, rmSync, cpSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { agentSkillsDirs, skillTargetPath } from "./paths.js";
import { backupExisting } from "./backup.js";
import { parseSkillFile } from "./frontmatter.js";
import type { AgentId, ImportResult, ImportTask, OverwriteMode, PlanItem } from "../types.js";

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
    try {
      copySkillDir(skill.dir, targetPath);
      wireAgent(agent, skill.name);
      if (!validateTarget(targetPath)) {
        return {
          status: "failed",
          targetPath,
          action: "skip",
          message: "导入后校验失败：SKILL.md 缺失或无法解析",
        };
      }
      return { status: "done", targetPath, action: "skip" };
    } catch (e) {
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

  // Case 3: target exists + overwrite → backup then replace.
  let backupPath: string | undefined;
  if (!opts.noBackup) {
    try {
      backupPath = backupExisting(agent, installName, targetPath) ?? undefined;
    } catch (e) {
      return {
        status: "failed",
        targetPath,
        action: "overwrite",
        message: `备份失败：${errMsg(e)}`,
      };
    }
  }
  try {
    rmSync(targetPath, { recursive: true, force: true });
    copySkillDir(skill.dir, targetPath);
    wireAgent(agent, skill.name);
    if (!validateTarget(targetPath)) {
      return {
        status: "failed",
        targetPath,
        action: "overwrite",
        backupPath,
        message: "导入后校验失败：SKILL.md 缺失或无法解析",
      };
    }
    return { status: "done", targetPath, action: "overwrite", backupPath };
  } catch (e) {
    return {
      status: "failed",
      targetPath,
      action: "overwrite",
      backupPath,
      message: errMsg(e),
    };
  }
}

/** Per-agent wiring beyond the copy (Gemini @-import, OpenCode config). */
function wireAgent(agent: AgentId, skillName: string): void {
  if (agent === "gemini") {
    wireGemini(skillName);
  }
  // OpenCode: copy-only by default; writing opencode.json is intentionally
  // avoided to keep user config untouched. Skills under ~/.config/opencode/skills
  // are picked up natively.
}

const GEMINI_MD = path.join(path.dirname(agentSkillsDirs.gemini), "GEMINI.md");
const GEMINI_IMPORT = (name: string) => `@./skills/${name}/SKILL.md`;

function wireGemini(skillName: string): void {
  const importLine = GEMINI_IMPORT(skillName);
  let existing = "";
  if (existsSync(GEMINI_MD)) {
    existing = readFileSync(GEMINI_MD, "utf8");
  }
  if (existing.includes(importLine)) return; // already wired
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  mkdirSync(path.dirname(GEMINI_MD), { recursive: true });
  appendFileSync(GEMINI_MD, `${prefix}${importLine}\n`, "utf8");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export { GEMINI_MD, GEMINI_IMPORT };
