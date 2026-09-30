// Repo cloning with a local cache.
// - Cache key: 12-char hash of the URL under ~/.skill-tui/cache/.
// - If cached: `git pull --ff-only` to refresh; on failure, remove & reclone.
// - If not cached: `git clone --depth 1 <url> <dest>` (shallow, fast).
// Errors are surfaced with friendly, classified messages.

import { existsSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { cacheDir, urlHash } from "./paths.js";

export interface CloneResult {
  dir: string;
  cached: boolean;
  commit: string | null;
}

function runGit(args: string[], cwd?: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      // On Windows, git is typically git.exe on PATH; spawning without a
      // shell avoids the Node DEP0190 deprecation. Node's default arg
      // quoting must stay on so paths with spaces (e.g. C:\Users\John Doe)
      // survive — do not set windowsVerbatimArguments.
      shell: false,
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      // ENOENT means git is not installed / not on PATH.
      reject(
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error("未找到 git 可执行文件，请先安装 git 并加入 PATH。")
          : err,
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `git 退出码 ${code}`));
    });
  });
}

async function gitAvailable(signal?: AbortSignal): Promise<boolean> {
  try {
    await runGit(["--version"], undefined, signal);
    return true;
  } catch (err) {
    if (signal?.aborted) throw err;
    return false;
  }
}

export async function cloneRepo(url: string, signal?: AbortSignal): Promise<CloneResult> {
  signal?.throwIfAborted();
  if (!(await gitAvailable(signal))) {
    throw new Error("未找到 git 可执行文件，请先安装 git 并加入 PATH。");
  }

  const id = await urlHash(url);
  const dir = path.join(cacheDir, id);
  await mkdir(cacheDir, { recursive: true });
  signal?.throwIfAborted();

  if (existsSync(dir) && existsSync(path.join(dir, ".git"))) {
    // Try a fast-forward update; fall back to a fresh clone on failure.
    try {
      await runGit(["pull", "--ff-only"], dir, signal);
      return { dir, cached: true, commit: await gitHead(dir, signal) };
    } catch (err) {
      if (signal?.aborted) throw err;
      rmSync(dir, { recursive: true, force: true });
    }
  }

  try {
    // `--` keeps a URL that starts with `-` from being read as a git option.
    await runGit(["clone", "--depth", "1", "--", url, dir], undefined, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(
      `克隆失败：${err instanceof Error ? err.message : String(err)}\n` +
        `请检查地址是否正确、网络是否通畅。`,
    );
  }
  return { dir, cached: false, commit: await gitHead(dir, signal) };
}

async function gitHead(dir: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const head = (await runGit(["rev-parse", "HEAD"], dir, signal)).trim();
    return /^[a-f0-9]{40}$/.test(head) ? head : null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
