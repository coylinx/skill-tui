// Repo cloning with a local cache.
// - Cache key: 12-char hash of the URL under ~/.skill-tui/cache/.
// - If cached: `git pull --ff-only` to refresh; on failure, remove & reclone.
// - If not cached: `git clone --depth 1 <url> <dest>` (shallow, fast).
// Errors are surfaced with friendly, classified messages.

import { existsSync, rmSync, utimesSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { cacheDir, urlHash } from "./paths.js";

export interface CloneResult {
  dir: string;
  cached: boolean;
}

function runGit(args: string[], cwd?: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      // On Windows, git is typically git.exe on PATH; spawning without a
      // shell avoids the Node DEP0190 deprecation and is safe here since
      // args are constructed internally (never user input passed raw).
      shell: false,
      signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let stderr = "";
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
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git 退出码 ${code}`));
    });
  });
}

export async function cloneRepo(url: string, { signal }: { signal?: AbortSignal } = {}): Promise<CloneResult> {
  signal?.throwIfAborted();
  await runGit(["--version"], undefined, signal);

  const id = await urlHash(url);
  const dir = path.join(cacheDir, id);
  await mkdir(cacheDir, { recursive: true });

  if (existsSync(dir) && existsSync(path.join(dir, ".git"))) {
    // Try a fast-forward update; fall back to a fresh clone on failure.
    try {
      await runGit(["pull", "--ff-only"], dir, signal);
      const now = new Date();
      utimesSync(dir, now, now);
      return { dir, cached: true };
    } catch {
      signal?.throwIfAborted();
      rmSync(dir, { recursive: true, force: true });
    }
  }

  try {
    await runGit(["clone", "--depth", "1", "--", url, dir], undefined, signal);
  } catch (err) {
    signal?.throwIfAborted();
    throw new Error(
      `克隆失败：${err instanceof Error ? err.message : String(err)}\n` +
        `请检查地址是否正确、网络是否通畅。`,
    );
  }
  return { dir, cached: false };
}
