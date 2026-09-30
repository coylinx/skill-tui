import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { importTask } from "../src/core/importer.js";
import { loadManifest } from "../src/core/manifest.js";
import { findInstallations, planRemoval, removeInstallation } from "../src/core/remove.js";
import { skillTargetPath } from "../src/core/paths.js";
import type { ImportTask } from "../src/types.js";

let root: string;
let targets: string[];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "remove-test-"));
  targets = [];
  rmSync(path.join(process.env.SKILL_TUI_HOME!, "manifest.json"), { force: true });
});

afterEach(() => {
  for (const target of targets) rmSync(target, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

function task(name: string): ImportTask {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: remove\n---\n# ${name}\n`);
  const target = skillTargetPath("codex", name);
  targets.push(target);
  return { skill: { id: `skills/${name}`, name, dir, description: "remove", relativePath: `skills/${name}` }, agent: "codex" };
}

describe("remove", () => {
  it("plans without writing and removes only manifest-managed targets", () => {
    const input = task("remove-managed");
    expect(importTask(input, { overwrite: false, noBackup: false }).status).toBe("done");
    const records = findInstallations("remove-managed");
    expect(planRemoval(records)[0].action).toBe("remove");
    expect(existsSync(skillTargetPath("codex", "remove-managed"))).toBe(true);
    const result = removeInstallation(records[0]);
    expect(result.status).toBe("done");
    expect(result.backupPath).toBeTruthy();
    expect(existsSync(skillTargetPath("codex", "remove-managed"))).toBe(false);
    expect(loadManifest().installations).toHaveLength(0);
    expect(readFileSync(path.join(result.backupPath!, "SKILL.md"), "utf8")).toContain("remove-managed");
  });

  it("cleans a missing target record without touching another installation", () => {
    const first = task("remove-missing");
    const second = task("remove-keep");
    expect(importTask(first, { overwrite: false, noBackup: false }).status).toBe("done");
    expect(importTask(second, { overwrite: false, noBackup: false }).status).toBe("done");
    rmSync(skillTargetPath("codex", "remove-missing"), { recursive: true, force: true });
    const result = removeInstallation(findInstallations("remove-missing")[0]);
    expect(result.status).toBe("missing");
    expect(loadManifest().installations.map((item) => item.installName)).toEqual(["remove-keep"]);
    expect(existsSync(skillTargetPath("codex", "remove-keep"))).toBe(true);
  });
});
