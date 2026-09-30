import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { contentHash, loadManifest, snapshotFiles, validateManifest, withManifestLock } from "../src/core/manifest.js";
import { importTask } from "../src/core/importer.js";
import { skillTargetPath } from "../src/core/paths.js";
import type { ImportTask, SkillFileDigest } from "../src/types.js";

let root: string;

beforeEach(() => {
  rmSync(path.join(process.env.SKILL_TUI_HOME!, "manifest.json"), { force: true });
  rmSync(`${path.join(process.env.SKILL_TUI_HOME!, "manifest.json")}.lock`, { force: true });
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function sourceSkill(name: string): ImportTask {
  const dir = path.join(root, "source", name);
  mkdirSync(path.join(dir, "nested"), { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\n# ${name}\n`);
  writeFileSync(path.join(dir, "nested", "notes.txt"), "stable content\n");
  return {
    skill: { id: `skills/${name}`, name, dir, description: "test", relativePath: `skills/${name}` },
    agent: "codex",
  };
}

describe("manifest", () => {
  it("records a successful fresh import with deterministic file hashes", () => {
    root = mkdtempSync(path.join(tmpdir(), "manifest-test-"));
    const task = sourceSkill("manifest-fresh");
    const result = importTask(task, { overwrite: false, noBackup: false });
    expect(result.status).toBe("done");
    const manifestPath = path.join(process.env.SKILL_TUI_HOME!, "manifest.json");
    const manifest = loadManifest(manifestPath);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.installations).toHaveLength(1);
    expect(manifest.installations[0].source.kind).toBe("local");
    expect(manifest.installations[0].source.commit).toBeNull();
    expect(manifest.installations[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.installations[0].files.map((file) => file.path)).toEqual(["SKILL.md", "nested/notes.txt"]);
    rmSync(skillTargetPath("codex", task.skill.name), { recursive: true, force: true });
  });

  it("updates one record on overwrite instead of duplicating it", () => {
    root = mkdtempSync(path.join(tmpdir(), "manifest-test-"));
    const task = sourceSkill("manifest-update");
    expect(importTask(task, { overwrite: false, noBackup: false }).status).toBe("done");
    writeFileSync(path.join(task.skill.dir, "nested", "notes.txt"), "changed\n");
    expect(importTask(task, { overwrite: true, noBackup: true }).status).toBe("done");
    const manifest = loadManifest(path.join(process.env.SKILL_TUI_HOME!, "manifest.json"));
    expect(manifest.installations).toHaveLength(1);
    expect(manifest.installations[0].updatedAt).not.toBe(manifest.installations[0].installedAt);
    rmSync(skillTargetPath("codex", task.skill.name), { recursive: true, force: true });
  });

  it("rejects a tampered manifest instead of resetting it", () => {
    root = mkdtempSync(path.join(tmpdir(), "manifest-test-"));
    const file = path.join(root, "manifest.json");
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, installations: [{ id: "wrong" }] }));
    expect(() => loadManifest(file)).toThrow(/manifest 无效/);
    expect(() => withManifestLock(() => undefined, file)).toThrow(/manifest 无效/);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("uses a stable hash for sorted snapshots and validates it", () => {
    root = mkdtempSync(path.join(tmpdir(), "manifest-test-"));
    const dir = path.join(root, "skill");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "b.txt"), "b");
    writeFileSync(path.join(dir, "a.txt"), "a");
    const files = snapshotFiles(dir);
    expect(files.map((file) => file.path)).toEqual(["a.txt", "b.txt"]);
    const tampered = { schemaVersion: 1 as const, installations: [] };
    validateManifest(tampered);
    expect(contentHash(files as SkillFileDigest[])).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(path.join(dir, "a.txt"), "utf8")).toBe("a");
  });
});
