import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyUpdatePlan, disposeUpdatePlans, planUpdates } from "../src/core/update.js";
import { importTask } from "../src/core/importer.js";
import { manifestFile, skillTargetPath } from "../src/core/paths.js";
import type { Skill } from "../src/types.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "update-test-"));
  rmSync(manifestFile, { force: true });
  rmSync(`${manifestFile}.lock`, { force: true });
});

function makeSkill(name: string): Skill {
  const dir = path.join(root, "source", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: update test\n---\n# ${name}\noriginal\n`);
  return { id: name, name, dir, description: "update test", relativePath: "." };
}

function clean(name: string): void {
  rmSync(skillTargetPath("codex", name), { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
  rmSync(manifestFile, { force: true });
}

describe("update planning and execution", () => {
  it("shows source file changes and applies them through the importer", async () => {
    const skill = makeSkill("update-basic");
    const target = skillTargetPath("codex", skill.name);
    try {
      expect(importTask({ skill, agent: "codex" }, { overwrite: false, noBackup: false }).status).toBe("done");
      writeFileSync(path.join(skill.dir, "SKILL.md"), `---\nname: ${skill.name}\ndescription: update test\n---\n# ${skill.name}\nchanged\n`);
      writeFileSync(path.join(skill.dir, "extra.md"), "new file\n");

      const plans = await planUpdates(skill.name, "codex");
      expect(plans).toHaveLength(1);
      expect(plans[0].item.status).toBe("update");
      expect(plans[0].item.changes.map((change) => `${change.kind}:${change.path}`)).toEqual(["modified:SKILL.md", "added:extra.md"]);
      expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("original");
      expect(applyUpdatePlan(plans)[0].status).toBe("done");
      expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("changed");
      expect(existsSync(path.join(target, "extra.md"))).toBe(true);
      disposeUpdatePlans(plans);
    } finally {
      clean(skill.name);
    }
  });

  it("blocks local edits unless force is requested", async () => {
    const skill = makeSkill("update-force");
    const target = skillTargetPath("codex", skill.name);
    try {
      expect(importTask({ skill, agent: "codex" }, { overwrite: false, noBackup: false }).status).toBe("done");
      writeFileSync(path.join(target, "SKILL.md"), readFileSync(path.join(target, "SKILL.md"), "utf8") + "local edit\n");
      writeFileSync(path.join(skill.dir, "SKILL.md"), `---\nname: ${skill.name}\ndescription: update test\n---\n# ${skill.name}\nsource update\n`);
      const plans = await planUpdates(skill.name, "codex");
      expect(plans[0].item.status).toBe("modified");
      expect(applyUpdatePlan(plans)[0].status).toBe("skipped");
      expect(applyUpdatePlan(plans, true)[0].status).toBe("done");
      expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("source update");
      disposeUpdatePlans(plans);
    } finally {
      clean(skill.name);
    }
  });

  it("can repair a missing managed target and reports unavailable sources", async () => {
    const skill = makeSkill("update-missing");
    const target = skillTargetPath("codex", skill.name);
    try {
      expect(importTask({ skill, agent: "codex" }, { overwrite: false, noBackup: false }).status).toBe("done");
      rmSync(target, { recursive: true, force: true });
      const missing = await planUpdates(skill.name, "codex");
      expect(missing[0].item.status).toBe("missing");
      expect(applyUpdatePlan(missing)[0].status).toBe("done");
      disposeUpdatePlans(missing);

      rmSync(skill.dir, { recursive: true, force: true });
      const unavailable = await planUpdates(skill.name, "codex");
      expect(unavailable[0].item.status).toBe("unavailable");
      disposeUpdatePlans(unavailable);
    } finally {
      clean(skill.name);
    }
  });
});
