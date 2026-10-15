// Test the Naming screen renders and confirms sanitized names.

import { describe, it, expect, vi } from "vitest";
import { render } from "ink-testing-library";
import React from "react";
import { Naming } from "../src/components/naming.js";
import type { Skill } from "../src/types.js";

const flush = () => new Promise((r) => setTimeout(r, 30));

function makeSkill(name: string): Skill {
  return {
    id: name,
    name,
    dir: `/tmp/${name}`,
    description: "d",
    relativePath: name,
  };
}

describe("Naming screen", () => {
  it("blocks names that collide after sanitization", async () => {
    const onConfirm = vi.fn();
    const { stdin, lastFrame } = render(
      <Naming skills={[makeSkill("Code Review"), makeSkill("code-review")]} onConfirm={onConfirm} onBack={() => {}} />,
    );
    await flush();
    stdin.write("\r");
    await flush();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("安装名称重复");
  });

  it("blocks names that sanitize to an empty string", async () => {
    const onConfirm = vi.fn();
    const { stdin, lastFrame } = render(
      <Naming skills={[makeSkill("!!!")]} onConfirm={onConfirm} onBack={() => {}} />,
    );
    await flush();
    stdin.write("\r");
    await flush();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(lastFrame()).toContain("安装名称不能为空");
  });
  it("renders each skill with a bordered input box", () => {
    const skills = [makeSkill("code-review"), makeSkill("deploy")];
    const { lastFrame, unmount } = render(
      <Naming skills={skills} onConfirm={() => {}} onBack={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    unmount();
    expect(frame).toMatch(/命名安装文件夹/);
    expect(frame).toMatch(/code-review/);
    expect(frame).toMatch(/deploy/);
    // bordered boxes present
    expect(frame).toMatch(/╭/);
  });

  it("confirms with sanitized names on Enter", async () => {
    const skills = [makeSkill("code-review")];
    let confirmed: Skill[] | null = null;
    const { stdin, unmount } = render(
      <Naming
        skills={skills}
        onConfirm={(r) => (confirmed = r)}
        onBack={() => {}}
      />,
    );
    await flush();
    stdin.write("\r"); // confirm with default name
    await flush();
    unmount();
    expect(confirmed).not.toBeNull();
    expect(confirmed![0].installName).toBe("code-review");
  });

  it("sanitizes invalid characters to hyphens on confirm", async () => {
    const skills = [makeSkill("code review!")];
    let confirmed: Skill[] | null = null;
    const { stdin, unmount } = render(
      <Naming
        skills={skills}
        onConfirm={(r) => (confirmed = r)}
        onBack={() => {}}
      />,
    );
    await flush();
    stdin.write("\r");
    await flush();
    unmount();
    expect(confirmed![0].installName).toBe("code-review");
  });

  it("moves focus with arrow keys (▸ follows the cursor)", async () => {
    const skills = [makeSkill("alpha"), makeSkill("beta")];
    const { stdin, lastFrame, unmount } = render(
      <Naming skills={skills} onConfirm={() => {}} onBack={() => {}} />,
    );
    await flush();
    // first row focused by default
    expect(lastFrame() ?? "").toMatch(/▸ alpha/);
    // down → second row
    stdin.write("\u001b[B");
    await flush();
    expect(lastFrame() ?? "").toMatch(/▸ beta/);
    // up → back to first
    stdin.write("\u001b[A");
    await flush();
    expect(lastFrame() ?? "").toMatch(/▸ alpha/);
    unmount();
  });
});
