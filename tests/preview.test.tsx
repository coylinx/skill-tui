// Test the Preview screen renders the plan with correct action glyphs.
// Uses temp dirs for source skills and real (temp-named) target detection.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "ink-testing-library";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Preview, formatDryRunPlan } from "../src/components/preview.js";
import { agentSkillsDirs, skillTargetPath } from "../src/core/paths.js";
import type { ImportTask, Skill } from "../src/types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "preview-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeSkill(name: string): Skill {
  const dir = path.join(tmp, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n# ${name}\n`);
  return { id: name, name, dir, description: "d", relativePath: name };
}

describe("Preview screen", () => {
  it("keeps confirmation text visible when a target path is wider than the terminal", () => {
    const previousRoot = agentSkillsDirs.codex;
    agentSkillsDirs.codex = path.join(tmp, "long-agent-directory-".repeat(8), "skills");
    let unmount: (() => void) | undefined;
    try {
      const skill = makeSkill("preview-long-path-xyz");
      const view = render(
        <Preview tasks={[{ skill, agent: "codex" }]} dryRun={false} noBackup={false} onConfirm={() => {}} onBack={() => {}} />,
      );
      unmount = view.unmount;
      const frame = view.lastFrame() ?? "";
      expect(frame).toContain("导入预览");
      expect(frame).toContain("将安装 1 项");
      expect(frame).toContain("preview-long-path-xyz");
      expect(frame).toContain("已存在处理：跳过（默认）");
    } finally {
      unmount?.();
      agentSkillsDirs.codex = previousRoot;
    }
  });

  it("renders install items with + glyph for fresh targets", () => {
    const skill = makeSkill("preview-fresh-xyz");
    const tasks: ImportTask[] = [{ skill, agent: "codex" }];
    const { lastFrame, unmount } = render(
      <Preview tasks={tasks} dryRun={false} noBackup={false} onConfirm={() => {}} onBack={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    unmount();
    expect(frame).toMatch(/导入预览/);
    expect(frame).toMatch(/将安装 1 项/);
    expect(frame).toMatch(/\+/); // fresh install glyph
  });

  it("marks existing targets as skip by default", () => {
    const skill = makeSkill("preview-skip-xyz");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const tasks: ImportTask[] = [{ skill, agent: "codex" }];
      const { lastFrame, unmount } = render(
        <Preview tasks={tasks} dryRun={false} noBackup={false} onConfirm={() => {}} onBack={() => {}} />,
      );
      const frame = lastFrame() ?? "";
      unmount();
      expect(frame).toMatch(/跳过 1 项/);
      expect(frame).toMatch(/跳过/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("toggles to overwrite mode with the o key", async () => {
    const skill = makeSkill("preview-ow-xyz");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const tasks: ImportTask[] = [{ skill, agent: "codex" }];
      const { stdin, lastFrame, unmount } = render(
        <Preview tasks={tasks} dryRun={false} noBackup={false} onConfirm={() => {}} onBack={() => {}} />,
      );
      await new Promise((r) => setTimeout(r, 20));
      stdin.write("o");
      await new Promise((r) => setTimeout(r, 20));
      const frame = lastFrame() ?? "";
      unmount();
      expect(frame).toMatch(/覆盖\+备份/);
      expect(frame).toMatch(/覆盖 1 项/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("starts in overwrite mode when initialOverwrite is set (--overwrite flag)", async () => {
    const skill = makeSkill("preview-flag-ow-xyz");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const tasks: ImportTask[] = [{ skill, agent: "codex" }];
      let confirmed = null as boolean | null;
      const { stdin, lastFrame, unmount } = render(
        <Preview
          tasks={tasks}
          dryRun={false}
          noBackup={false}
          initialOverwrite={true}
          onConfirm={(ow) => (confirmed = ow)}
          onBack={() => {}}
        />,
      );
      await new Promise((r) => setTimeout(r, 20));
      const frame = lastFrame() ?? "";
      expect(frame).toMatch(/覆盖\+备份/); // overwrite mode active without pressing o
      expect(frame).toMatch(/覆盖 1 项/);
      stdin.write("\r");
      await new Promise((r) => setTimeout(r, 20));
      unmount();
      expect(confirmed).toBe(true);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("calls onConfirm with overwrite=false on Enter by default", async () => {
    const skill = makeSkill("preview-enter-xyz");
    const tasks: ImportTask[] = [{ skill, agent: "codex" }];
    let confirmed = null as boolean | null;
    const { stdin, unmount } = render(
      <Preview
        tasks={tasks}
        dryRun={false}
        noBackup={false}
        onConfirm={(ow) => (confirmed = ow)}
        onBack={() => {}}
      />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    unmount();
    expect(confirmed).toBe(false);
  });

  it("returns a persistent dry-run report instead of printing inside Ink", async () => {
    const skill = makeSkill("preview-dry-run-xyz");
    const tasks: ImportTask[] = [{ skill, agent: "codex" }];
    let report = "";
    const { stdin } = render(
      <Preview
        tasks={tasks}
        dryRun
        noBackup={false}
        onDryRun={(value) => (report = value)}
        onConfirm={() => {}}
        onBack={() => {}}
      />,
    );
    stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(report).toMatch(/\[dry-run\]/);
    expect(report).toMatch(/INSTALL\s+codex\/preview-dry-run-xyz/);
  });

  it("formats dry-run plans without writing to stdout", () => {
    const skill = makeSkill("preview-format-xyz");
    const report = formatDryRunPlan(
      [{ skill, agent: "codex", targetPath: "C:/target", exists: false, action: "skip" }],
      false,
    );
    expect(report).toContain("覆盖模式: 否");
    expect(report).toContain("INSTALL");
  });
});
