// Test the Preview screen renders the plan with correct action glyphs.
// Uses temp dirs for source skills and real (temp-named) target detection.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "ink-testing-library";
import React from "react";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Preview, formatDryRun } from "../src/components/preview.js";
import { skillTargetPath } from "../src/core/paths.js";
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
  it("honors initial overwrite mode and accurately labels no-backup mode", () => {
    const skill = makeSkill("preview-flags");
    const target = skillTargetPath("claude", skill.name);
    mkdirSync(target, { recursive: true });
    const tasks: ImportTask[] = [{ skill, agent: "claude" }];
    const { lastFrame } = render(
      <Preview tasks={tasks} dryRun={false} noBackup initialOverwrite onConfirm={() => {}} onBack={() => {}} />,
    );
    expect(lastFrame()).toContain("覆盖 1 项");
    expect(lastFrame()).toContain("覆盖（不备份）");
    expect(lastFrame()).not.toContain("覆盖+备份");
  });

  it("formats a readable dry-run plan for output after terminal restoration", () => {
    const skill = makeSkill("dry-run-format");
    const output = formatDryRun([{ skill, agent: "claude", targetPath: "/example/skills/dry-run-format", exists: false, action: "skip" }], false);
    expect(output).toContain("[dry-run]");
    expect(output).toContain("INSTALL   claude/dry-run-format → /example/skills/dry-run-format");
  });
  it("renders install items with + glyph for fresh targets", () => {
    const skill = makeSkill("preview-fresh-xyz");
    const tasks: ImportTask[] = [{ skill, agent: "claude" }];
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
    const target = skillTargetPath("claude", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const tasks: ImportTask[] = [{ skill, agent: "claude" }];
      const { lastFrame, unmount } = render(
        <Preview tasks={tasks} dryRun={false} noBackup={false} onConfirm={() => {}} onBack={() => {}} />,
      );
      const frame = lastFrame() ?? "";
      unmount();
      expect(frame).toMatch(/◷/); // exists glyph
      expect(frame).toMatch(/跳过/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("toggles to overwrite mode with the o key", async () => {
    const skill = makeSkill("preview-ow-xyz");
    const target = skillTargetPath("claude", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const tasks: ImportTask[] = [{ skill, agent: "claude" }];
      const { stdin, lastFrame, unmount } = render(
        <Preview tasks={tasks} dryRun={false} noBackup={false} onConfirm={() => {}} onBack={() => {}} />,
      );
      await new Promise((r) => setTimeout(r, 20));
      stdin.write("o");
      await new Promise((r) => setTimeout(r, 20));
      const frame = lastFrame() ?? "";
      unmount();
      expect(frame).toMatch(/覆盖\+备份/);
      expect(frame).toMatch(/↻/); // overwrite glyph
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("calls onConfirm with overwrite=false on Enter by default", async () => {
    const skill = makeSkill("preview-enter-xyz");
    const tasks: ImportTask[] = [{ skill, agent: "claude" }];
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
});
