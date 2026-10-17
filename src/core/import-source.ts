// Resolve import inputs once so discovery, history, and provenance agree.
// Local folders are read in place; only Git sources use the clone cache.
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSkills } from "./discover.js";
import { sourceLocation } from "./manifest.js";
import { cloneRepo } from "./repo.js";
import type { Skill, SkillSource } from "../types.js";

export interface ImportSource {
  kind: SkillSource["kind"];
  location: string;
}

interface ResolveOptions {
  cwd?: string;
  home?: string;
  platform?: NodeJS.Platform;
}

const INPUT_HINT = "请输入 Git URL、owner/repo、github:owner/repo 或本地目录（如 ./skills）。";
const SHORTHAND = /^([a-z\d](?:[a-z\d-]*[a-z\d])?)\/([a-z\d_.-]+)$/i;

export function resolveSourceInput(raw: string, options: ResolveOptions = {}): ImportSource {
  const input = raw.trim();
  if (!input || input.startsWith("-") || /[\r\n\0]/.test(input)) throw new Error(INPUT_HINT);
  const platform = options.platform ?? process.platform;
  const paths = platform === "win32" ? path.win32 : path.posix;
  const cwd = options.cwd ?? process.cwd();
  const home = options.home ?? os.homedir();

  if (input.startsWith("file:")) {
    try {
      return { kind: "local", location: fileURLToPath(input, { windows: platform === "win32" }) };
    } catch {
      throw new Error("本地 file: 地址无效，请使用绝对目录路径或 file:/// 路径。");
    }
  }

  const local = input === "~" ? home : /^~[/\\]/.test(input)
    ? paths.resolve(home, input.slice(2)) : paths.resolve(cwd, input);
  // An existing relative directory takes precedence over owner/repo shorthand.
  if (!input.startsWith("github:") && (
    paths.isAbsolute(input) || /^[a-z]:[/\\]/i.test(input) || input.startsWith("\\\\") ||
    /^(?:\.{1,2}(?:[/\\]|$)|~(?:[/\\]|$))/.test(input) || existsSync(local)
  )) return { kind: "local", location: local };

  const shorthand = (input.startsWith("github:") ? input.slice(7) : input).match(SHORTHAND);
  if (shorthand && !["", ".", ".."].includes(shorthand[2].replace(/\.git$/i, ""))) {
    const [, owner, repo] = shorthand;
    return { kind: "git", location: `https://github.com/${owner}/${repo.replace(/\.git$/i, "")}.git` };
  }
  if (input.startsWith("github:")) throw new Error(`GitHub 简写应为 github:owner/repo。${INPUT_HINT}`);
  if (/^(?:https?|ssh|git):\/\//i.test(input)) {
    try {
      if (!new URL(input).hostname || /\s/.test(input)) throw new Error();
      return { kind: "git", location: input };
    } catch { throw new Error(`Git 地址无效。${INPUT_HINT}`); }
  }
  // Preserve scp-style SSH URLs for the user's existing Git authentication.
  if (/^[^\s/@:]+@[^\s/:]+:.+$/.test(input)) return { kind: "git", location: input };
  throw new Error(INPUT_HINT);
}

export async function loadImportSource(source: ImportSource, signal?: AbortSignal): Promise<{
  dir: string;
  skills: Skill[];
}> {
  signal?.throwIfAborted();
  let dir = source.location;
  let commit: string | null = null;
  if (source.kind === "git") {
    const cloned = await cloneRepo(source.location, signal);
    dir = cloned.dir;
    commit = cloned.commit ?? null;
  } else {
    try {
      if (!statSync(dir).isDirectory()) throw new Error("来源不是目录");
    } catch (error) {
      throw new Error(`无法读取本地目录：${dir}\n${error instanceof Error ? error.message : String(error)}\n请检查目录路径和读取权限。`);
    }
  }
  signal?.throwIfAborted();
  const location = source.kind === "git" ? sourceLocation(source.location) : source.location;
  return {
    dir,
    skills: discoverSkills(dir).map((skill) => ({
      ...skill,
      source: { kind: source.kind, location, relativePath: skill.relativePath, commit },
    })),
  };
}
