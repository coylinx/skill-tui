import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadImportSource, resolveSourceInput } from "../src/core/import-source.js";
import { importTask, plan } from "../src/core/importer.js";
import { inventory } from "../src/core/inventory.js";
import { loadManifest } from "../src/core/manifest.js";
import { applyUpdatePlan, disposeUpdatePlans, planUpdates } from "../src/core/update.js";
import { findInstallations, planRemoval, removeInstallations } from "../src/core/remove.js";
import { recentBackups, restoreBackup } from "../src/core/backup.js";
import { agentSkillsDirs, manifestFile, skillTargetPath } from "../src/core/paths.js";

let root: string;
const originalSharedRoot = agentSkillsDirs.shared;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "shared-target-"));
  agentSkillsDirs.shared = path.join(root, ".agents", "skills");
  rmSync(manifestFile, { force: true });
});
afterEach(() => {
  agentSkillsDirs.shared = originalSharedRoot;
  rmSync(root, { recursive: true, force: true });
});

describe("shared target lifecycle", () => {
  it("imports, inventories, updates, removes, and restores a local Skill with provenance", async () => {
    // # must remain a literal part of local paths, including Windows drives.
    const sourceRoot = path.join(root, "source #1 local");
    const dir = path.join(sourceRoot, "skills", "shared-example");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), "---\nname: shared-example\ndescription: shared fixture\n---\noriginal\n");
    const { skills } = await loadImportSource(resolveSourceInput(sourceRoot));
    const task = { skill: skills[0], agent: "shared" as const };
    const target = skillTargetPath("shared", "shared-example");

    expect(plan([task], false, false)[0]).toMatchObject({ agent: "shared", targetPath: target, exists: false });
    expect(existsSync(target)).toBe(false);
    expect(existsSync(manifestFile)).toBe(false);
    expect(importTask(task, { overwrite: false, noBackup: false }).status).toBe("done");
    let manifest = loadManifest();
    expect(manifest.installations).toHaveLength(1);
    expect(manifest.installations[0]).toMatchObject({ agent: "shared", targetPath: target,
      source: { kind: "local", location: sourceRoot, relativePath: "skills/shared-example", commit: null } });
    expect(inventory(manifest, { shared: agentSkillsDirs.shared })[0].status).toBe("managed");

    writeFileSync(path.join(dir, "extra.md"), "updated\n");
    const updates = await planUpdates("shared-example", "shared");
    try {
      expect(updates[0].item.status).toBe("update");
      expect(existsSync(path.join(target, "extra.md"))).toBe(false);
      expect(applyUpdatePlan(updates)[0].status).toBe("done");
      expect(readFileSync(path.join(target, "extra.md"), "utf8")).toBe("updated\n");
    } finally { disposeUpdatePlans(updates); }

    const records = findInstallations("shared-example", "shared");
    expect(planRemoval(records)[0].action).toBe("remove");
    expect(existsSync(target)).toBe(true);
    expect(removeInstallations(records)[0].status).toBe("done");
    expect(existsSync(target)).toBe(false);
    expect(loadManifest().installations).toHaveLength(0);

    const backup = recentBackups().find((entry) => entry.agent === "shared" && entry.installation?.files.some((file) => file.path === "extra.md"));
    expect(backup).toBeDefined();
    restoreBackup(backup!);
    manifest = loadManifest();
    expect(manifest.installations[0].source.location).toBe(sourceRoot);
    expect(readFileSync(path.join(target, "extra.md"), "utf8")).toBe("updated\n");
    expect(inventory(manifest, { shared: agentSkillsDirs.shared })[0].status).toBe("managed");
  });
});
