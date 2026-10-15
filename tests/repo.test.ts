import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cloneRepo } from "../src/core/repo.js";

let source: string;
function git(...args: string[]) {
  execFileSync("git", ["-C", source, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args]);
}
beforeEach(() => {
  source = mkdtempSync(path.join(tmpdir(), "skill tui repo "));
  git("init", "--quiet");
  writeFileSync(path.join(source, "SKILL.md"), "original");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
});
afterEach(() => rmSync(source, { recursive: true, force: true }));

describe("repository cache with real Git", () => {
  it("clones paths with spaces and refreshes cached content and last-use time", async () => {
    const first = await cloneRepo(source);
    expect(first.cached).toBe(false);
    expect(readFileSync(path.join(first.dir, "SKILL.md"), "utf8")).toBe("original");
    const stale = new Date(Date.now() - 3 * 3600000);
    utimesSync(first.dir, stale, stale);
    writeFileSync(path.join(source, "SKILL.md"), "updated");
    git("add", ".");
    git("commit", "--quiet", "-m", "update");
    const second = await cloneRepo(source);
    expect(second).toEqual({ dir: first.dir, cached: true });
    expect(readFileSync(path.join(second.dir, "SKILL.md"), "utf8")).toBe("updated");
    expect(statSync(second.dir).mtimeMs).toBeGreaterThan(Date.now() - 10000);
  });

  it("honors cancellation before starting Git", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(cloneRepo(source, { signal: controller.signal })).rejects.toThrow();
  });

  it("treats option-like repository input as an address rather than Git flags", async () => {
    await expect(cloneRepo("--help")).rejects.toThrow("克隆失败");
  });
});
