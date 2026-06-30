// Tests for discover.ts using temp dirs with realistic repo layouts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverSkills } from "../src/core/discover.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "skill-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function skill(name: string, desc: string, parent = "skills") {
  const dir = path.join(root, parent, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${desc}\n---\n# ${name}\nbody\n`,
  );
  return dir;
}

describe("discoverSkills", () => {
  it("finds skills under skills/<name>/SKILL.md (multi-skill layout)", () => {
    skill("code-review", "审查改动");
    skill("deploy", "部署到 staging");
    const found = discoverSkills(root);
    expect(found.map((s) => s.name).sort()).toEqual(["code-review", "deploy"]);
    expect(found[0].description).toBe("审查改动");
  });

  it("treats the repo root as a single skill when SKILL.md is at root", () => {
    writeFileSync(
      path.join(root, "SKILL.md"),
      "---\ndescription: 单 skill 仓库\n---\n# root skill\n",
    );
    const found = discoverSkills(root);
    expect(found).toHaveLength(1);
    expect(found[0].relativePath).toBe(".");
  });

  it("falls back to recursive search for unusual layouts", () => {
    mkdirSync(path.join(root, "packages", "my-plugin"), { recursive: true });
    writeFileSync(
      path.join(root, "packages", "my-plugin", "SKILL.md"),
      "---\nname: my-plugin\ndescription: 嵌套 skill\n---\nbody\n",
    );
    const found = discoverSkills(root);
    expect(found.map((s) => s.name)).toEqual(["my-plugin"]);
  });

  it("skips .git and node_modules during recursive fallback", () => {
    mkdirSync(path.join(root, ".git", "hooks"), { recursive: true });
    writeFileSync(
      path.join(root, ".git", "SKILL.md"),
      "---\nname: fake\ndescription: 不应被发现\n---\n",
    );
    const found = discoverSkills(root);
    expect(found).toHaveLength(0);
  });

  it("uses directory name when frontmatter name is absent", () => {
    const dir = path.join(root, "skills", "no-name");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), "---\ndescription: 有描述\n---\nbody\n");
    const found = discoverSkills(root);
    expect(found[0].name).toBe("no-name");
  });

  it("uses body first line when description is absent", () => {
    const dir = path.join(root, "skills", "no-desc");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), "---\nname: no-desc\n---\n# Title\n这是正文首行\n");
    const found = discoverSkills(root);
    expect(found[0].description).toBe("这是正文首行");
  });
});
