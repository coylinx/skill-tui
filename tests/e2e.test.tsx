// Deterministic full-flow test for the App state machine. Git, history, and
// agent probing are mocked so CI never needs network access or user files.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const mockState = vi.hoisted(() => ({
  repoDir: "",
  holdClone: false,
  cloneAborted: false,
}));

vi.mock("../src/core/repo.js", () => ({
  cloneRepo: vi.fn((_url: string, signal?: AbortSignal) => {
    if (!mockState.holdClone) {
      return Promise.resolve({ dir: mockState.repoDir, cached: false });
    }
    return new Promise((_resolve, reject) => {
      signal?.addEventListener(
        "abort",
        () => {
          mockState.cloneAborted = true;
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }),
}));

vi.mock("../src/core/history.js", () => ({
  loadHistory: vi.fn(async () => []),
  saveHistory: vi.fn(async () => {}),
}));

vi.mock("../src/core/agents.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/agents.js")>();
  return {
    ...actual,
    probeAgents: vi.fn(async () => [
      {
        id: "claude",
        label: "Claude Code",
        exe: "claude",
        skillsDir: "C:/isolated/.claude/skills",
        status: "installed",
      },
    ]),
  };
});

import { App, type AppFlags } from "../src/app.js";
import { cloneRepo } from "../src/core/repo.js";

const flags: AppFlags = { dryRun: false, overwrite: false, noBackup: false };
let fixtureRoot: string;

beforeEach(() => {
  vi.clearAllMocks();
  fixtureRoot = mkdtempSync(path.join(tmpdir(), "skill-tui-e2e-"));
  const skillDir = path.join(fixtureRoot, "skills", "sample-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: sample-skill\ndescription: deterministic fixture\n---\n# Sample\n",
    "utf8",
  );
  mockState.repoDir = fixtureRoot;
  mockState.holdClone = false;
  mockState.cloneAborted = false;
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

async function waitForFrame(
  lastFrame: () => string | undefined,
  pattern: RegExp,
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const frame = lastFrame() ?? "";
    if (pattern.test(frame)) return frame;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for frame: ${pattern}\nLast frame:\n${lastFrame() ?? ""}`);
}

const settleInputHandlers = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("App full flow", () => {
  it("aborts an in-flight clone when Escape returns home", async () => {
    mockState.holdClone = true;
    const { stdin, lastFrame, unmount } = render(
      <App flags={flags} initialUrl="https://example.test/slow.git" />,
    );

    await waitForFrame(lastFrame, /正在克隆/);
    await settleInputHandlers();
    stdin.write("\u001b");
    await waitForFrame(lastFrame, /输入 Skill 仓库的 Git 地址/);
    expect(mockState.cloneAborted).toBe(true);
    expect(cloneRepo).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("drives URL → skills → naming → agents → preview and backs out one screen at a time", async () => {
    const initialUrl = "https://example.test/skills.git";
    const { stdin, lastFrame, unmount } = render(
      <App flags={flags} initialUrl={initialUrl} />,
    );

    await waitForFrame(lastFrame, /发现 1 个 Skill/);
    expect(cloneRepo).toHaveBeenCalledTimes(1);
    expect(cloneRepo).toHaveBeenCalledWith(initialUrl, expect.any(AbortSignal));

    await settleInputHandlers();
    stdin.write(" ");
    await settleInputHandlers();
    stdin.write("\r");
    await waitForFrame(lastFrame, /命名安装文件夹/);

    await settleInputHandlers();
    stdin.write("\r");
    await waitForFrame(lastFrame, /选择目标 Agent/);

    await settleInputHandlers();
    stdin.write(" ");
    await settleInputHandlers();
    stdin.write("\r");
    await waitForFrame(lastFrame, /导入预览/);

    await settleInputHandlers();
    stdin.write("\u001b");
    await waitForFrame(lastFrame, /选择目标 Agent/);
    await settleInputHandlers();
    stdin.write("\u001b");
    await waitForFrame(lastFrame, /命名安装文件夹/);
    await settleInputHandlers();
    stdin.write("\u001b");
    await waitForFrame(lastFrame, /发现 1 个 Skill/);
    await settleInputHandlers();
    stdin.write("\u001b");
    await waitForFrame(lastFrame, /输入 Skill 仓库的 Git 地址/);

    // Returning home must not auto-submit initialUrl again.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(lastFrame() ?? "").toMatch(/输入 Skill 仓库的 Git 地址/);
    expect(cloneRepo).toHaveBeenCalledTimes(1);
    unmount();
  });
});
