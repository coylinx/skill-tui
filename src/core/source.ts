// Materialize a managed source without touching the shared cache. Update
// previews must be able to inspect a remote source without changing cache
// state; execution still flows through importer.ts for the actual target write.
import * as fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseSkillFile } from "./frontmatter.js";
import type { InstallationRecord, Skill } from "../types.js";

export interface MaterializedSource {
  root: string;
  skill: Skill;
  commit: string | null;
  cleanup: () => void;
}

function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => { stdout += data.toString(); });
    child.stderr?.on("data", (data) => { stderr += data.toString(); });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `git 退出码 ${code}`)));
  });
}

function skillFrom(record: InstallationRecord, root: string): Skill {
  const relative = record.source.relativePath === "." ? "" : record.source.relativePath;
  const dir = path.resolve(root, relative);
  const skillFile = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillFile)) throw new Error(`来源缺少 SKILL.md：${record.source.relativePath}`);
  const parsed = parseSkillFile(skillFile);
  return {
    id: record.skillId,
    name: parsed.name || record.installName,
    installName: record.installName,
    dir,
    description: parsed.description || record.installName,
    relativePath: record.source.relativePath,
    source: { ...record.source },
  };
}

export async function materializeSource(record: InstallationRecord): Promise<MaterializedSource> {
  if (record.source.kind === "local") {
    const root = path.resolve(record.source.location);
    if (!fs.existsSync(root)) throw new Error(`本地来源不存在：${root}`);
    return { root, skill: skillFrom(record, root), commit: record.source.commit, cleanup: () => {} };
  }

  const root = mkdtempSync(path.join(tmpdir(), "skill-tui-update-"));
  try {
    await runGit(["clone", "--depth", "1", "--", record.source.location, root]);
    const head = (await runGit(["rev-parse", "HEAD"], root)).trim();
    const commit = /^[a-f0-9]{40}$/.test(head) ? head : null;
    const skill = skillFrom(record, root);
    return { root, skill: { ...skill, source: { ...skill.source!, commit } }, commit,
      cleanup: () => rmSync(root, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`获取来源失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
