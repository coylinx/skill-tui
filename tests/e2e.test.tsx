// Real local Git repositories make the complete flow repeatable and offline.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { App, type AppFlags } from "../src/app.js";
import { skillTargetPath } from "../src/core/paths.js";
import * as repo from "../src/core/repo.js";
import { loadBackupIndex } from "../src/core/backup.js";

let root: string;
const flags: AppFlags = { dryRun: false, overwrite: false, noBackup: false };
const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "skill-tui-e2e-"));
  for (const name of ["alpha", "beta"]) {
    const dir = path.join(root, "skills", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill\n---\nnew content\n`);
  }
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture"]);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("App full flow (local Git)", () => {
  it("selects, renames, navigates back, overwrites with backup, and returns home", async () => {
    const target = skillTargetPath("claude", "alpha-custom");
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "old content");
    const ui = render(<App flags={{ ...flags, overwrite: true }} initialUrl={root} />);
    const frame = () => ui.lastFrame() ?? "";
    const press = async (key: string) => { await flush(); ui.stdin.write(key); await flush(); };
    await expect.poll(frame).toMatch(/发现 2 个 Skill/);
    await press("\r");
    expect(frame()).toContain("请至少用 Space 勾选一个 Skill");
    await press(" ");
    await press("\r");
    expect(frame()).toContain("命名安装文件夹");
    await press("-custom");
    await press("\r");
    await expect.poll(frame).toContain("选择目标 Agent");
    await press("\r");
    expect(frame()).toContain("请至少用 Space 勾选一个目标 Agent");
    await press(" ");
    await press("\r");
    expect(frame()).toContain("导入预览");
    expect(frame()).toContain("覆盖 1 项");
    expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("old content");

    await press("\x1b");
    await expect.poll(frame).toContain("选择目标 Agent");
    await press("\x1b");
    expect(frame()).toContain("alpha-custom");
    await press("\x1b");
    expect(frame()).toContain("发现 2 个 Skill");
    expect(frame()).toContain("◉");
    await press("\r");
    await press("\r");
    await expect.poll(frame).toContain("选择目标 Agent");
    await press("\r"); // previously selected agent is retained
    expect(frame()).toContain("导入预览");
    await press("\r");
    await expect.poll(frame).toContain("导入完成");
    expect(frame()).toContain("1 项成功");
    expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("new content");
    const backup = loadBackupIndex().find((record) => record.originalPath === target);
    expect(backup).toBeDefined();
    expect(readFileSync(path.join(backup!.backupPath, "SKILL.md"), "utf8")).toBe("old content");
    await press("b");
    expect(frame()).toContain("选择要恢复的备份");
    await press("\x1b");
    expect(frame()).toContain("导入完成");
    await press("r");
    expect(frame()).toContain("输入 Skill 仓库的 Git 地址");
    await flush();
    expect(frame()).toContain("输入 Skill 仓库的 Git 地址");
    ui.unmount();
  });

  it("dry-run exits at preview without installing any skills", async () => {
    const target = skillTargetPath("claude", "alpha");
    const ui = render(<App flags={{ ...flags, dryRun: true }} initialUrl={root} />);
    const frame = () => ui.lastFrame() ?? "";
    const press = async (key: string) => { await flush(); ui.stdin.write(key); await flush(); };
    await expect.poll(frame).toContain("发现 2 个 Skill");
    await press(" ");
    await press("\r");
    await press("\r");
    await expect.poll(frame).toContain("选择目标 Agent");
    await press(" ");
    await press("\r");
    expect(frame()).toContain("dry-run");
    await press("\r");
    expect(existsSync(target)).toBe(false);
    expect(frame()).not.toContain("导入完成");
    ui.unmount();
  });

  it("cancels cloning on Esc and ignores stale completion", async () => {
    let finish!: (result: repo.CloneResult) => void;
    const clone = vi.spyOn(repo, "cloneRepo").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const ui = render(<App flags={flags} initialUrl={root} />);
    await flush();
    const signal = clone.mock.calls[0][1]!.signal!;
    ui.stdin.write("\x1b");
    await flush();
    expect(signal.aborted).toBe(true);
    finish({ dir: root, cached: false });
    await flush();
    expect(ui.lastFrame()).toContain("输入 Skill 仓库的 Git 地址");
    ui.unmount();
  });
});
