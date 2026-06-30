// Test the Naming screen renders and confirms sanitized names.

import { describe, it, expect } from "vitest";
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
  it("renders each skill with its default install name", () => {
    const skills = [makeSkill("code-review"), makeSkill("deploy")];
    const { lastFrame, unmount } = render(
      <Naming skills={skills} onConfirm={() => {}} onBack={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    unmount();
    expect(frame).toMatch(/命名安装文件夹/);
    expect(frame).toMatch(/code-review/);
    expect(frame).toMatch(/deploy/);
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

  it("rejects invalid characters by sanitizing to hyphens", async () => {
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
    // start editing, type nothing extra, just confirm — name already has bad chars
    stdin.write("\r");
    await flush();
    unmount();
    // "code review!" → sanitized to "code-review"
    expect(confirmed![0].installName).toBe("code-review");
  });
});
