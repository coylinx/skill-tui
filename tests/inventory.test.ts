import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { doctor } from "../src/core/doctor.js";
import { inventory } from "../src/core/inventory.js";
import { importTask } from "../src/core/importer.js";
import { agentSkillsDirs, skillTargetPath } from "../src/core/paths.js";
import { loadManifest } from "../src/core/manifest.js";
import type { ImportTask } from "../src/types.js";

let root: string;
const touched: string[] = [];
const testRoots = { claude: path.join("C:/skill-tui-test", "claude"), codex: "", cursor: path.join("C:/skill-tui-test", "cursor"), zcode: path.join("C:/skill-tui-test", "zcode"), openclaw: path.join("C:/skill-tui-test", "openclaw"), hermes: path.join("C:/skill-tui-test", "hermes"), opencode: path.join("C:/skill-tui-test", "opencode") };

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "inventory-test-"));
  rmSync(path.join(process.env.SKILL_TUI_HOME!, "manifest.json"), { force: true });
});

afterEach(() => {
  for (const target of touched.splice(0)) rmSync(target, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

function task(name: string): ImportTask {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: inventory\n---\n# ${name}\n`);
  return { skill: { id: `skills/${name}`, name, dir, description: "inventory", relativePath: `skills/${name}` }, agent: "codex" };
}

describe("inventory", () => {
  it("distinguishes managed, modified, missing, and unmanaged skills", () => {
    const managed = task("inventory-managed");
    const missing = task("inventory-missing");
    const modified = task("inventory-modified");
    for (const item of [managed, missing, modified]) touched.push(skillTargetPath("codex", item.skill.name));
    expect(importTask(managed, { overwrite: false, noBackup: false }).status).toBe("done");
    expect(importTask(missing, { overwrite: false, noBackup: false }).status).toBe("done");
    expect(importTask(modified, { overwrite: false, noBackup: false }).status).toBe("done");
    writeFileSync(path.join(skillTargetPath("codex", modified.skill.name), "extra.txt"), "edited\n");
    rmSync(skillTargetPath("codex", missing.skill.name), { recursive: true, force: true });

    const unmanaged = path.join(agentSkillsDirs.codex, "inventory-unmanaged");
    touched.push(unmanaged);
    mkdirSync(unmanaged, { recursive: true });
    writeFileSync(path.join(unmanaged, "SKILL.md"), "---\nname: unmanaged\ndescription: x\n---\n# Unmanaged\n");

    testRoots.codex = agentSkillsDirs.codex;
    const byName = new Map(inventory(loadManifest(), testRoots).map((item) => [item.installName, item.status]));
    expect(byName.get("inventory-managed")).toBe("managed");
    expect(byName.get("inventory-modified")).toBe("modified");
    expect(byName.get("inventory-missing")).toBe("missing");
    expect(byName.get("inventory-unmanaged")).toBe("unmanaged");
  });

  it("doctor returns a non-zero health report for missing and changed targets", () => {
    const item = task("doctor-check");
    const target = skillTargetPath("codex", item.skill.name);
    touched.push(target);
    expect(importTask(item, { overwrite: false, noBackup: false }).status).toBe("done");
    writeFileSync(path.join(target, "changed.txt"), "changed\n");
    testRoots.codex = agentSkillsDirs.codex;
    const report = doctor(undefined, testRoots);
    expect(report.ok).toBe(false);
    expect(report.checked).toBe(1);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTENT_MODIFIED", severity: "warning" }),
    ]));
  });

  it("reports malformed manifest without touching any target", () => {
    writeFileSync(path.join(process.env.SKILL_TUI_HOME!, "manifest.json"), "{\"schemaVersion\":99}");
    const report = doctor();
    expect(report.ok).toBe(false);
    expect(report.issues[0]).toEqual(expect.objectContaining({ code: "MANIFEST_INVALID", severity: "error" }));
  });
});
