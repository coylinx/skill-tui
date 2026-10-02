import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fault = vi.hoisted(() => ({ manifestRename: false }));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: (...args: Parameters<typeof fs.renameSync>) => {
    if (fault.manifestRename && String(args[1]).endsWith("manifest.json")) throw new Error("injected manifest failure");
    return fs.renameSync(...args);
  } };
});
import * as fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { importTask } from "../src/core/importer.js";
import { loadManifest } from "../src/core/manifest.js";
import { loadBackupIndex, restoreBackup } from "../src/core/backup.js";
import { manifestFile, backupIndexFile, skillTargetPath } from "../src/core/paths.js";
import type { ImportTask } from "../src/types.js";

let root: string;
let task: ImportTask;
let target: string;
beforeEach(() => {
  fault.manifestRename = false;
  fs.rmSync(manifestFile, { force: true });
  fs.rmSync(backupIndexFile, { force: true });
  root = fs.mkdtempSync(path.join(tmpdir(), "skill-transaction-"));
  fs.writeFileSync(path.join(root, "SKILL.md"), "---\nname: transaction\ndescription: old\n---\nold\n");
  task = { agent: "codex", skill: { id: "transaction", name: "transaction", dir: root, description: "old", relativePath: "." } };
  target = skillTargetPath("codex", task.skill.name);
});
afterEach(() => {
  fault.manifestRename = false;
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(target, { recursive: true, force: true });
});

describe("target and manifest transaction failures", () => {
  it("rolls back a fresh install when manifest replacement fails", () => {
    fault.manifestRename = true;
    expect(importTask(task, { overwrite: false, noBackup: false }).status).toBe("failed");
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(manifestFile)).toBe(false);
    expect(fs.existsSync(`${manifestFile}.lock`)).toBe(false);
  });
  it("keeps old content and exact manifest bytes on a failed overwrite", () => {
    expect(importTask(task, { overwrite: false, noBackup: false }).status).toBe("done");
    const before = fs.readFileSync(manifestFile, "utf8");
    fs.writeFileSync(path.join(root, "SKILL.md"), "---\nname: transaction\n---\nnew\n");
    fault.manifestRename = true;
    expect(importTask(task, { overwrite: true, noBackup: false }).status).toBe("failed");
    expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("old");
    expect(fs.readFileSync(manifestFile, "utf8")).toBe(before);
  });
  it("uses distinct backups for rapid updates and restores content and provenance", () => {
    expect(importTask(task, { overwrite: false, noBackup: false }).status).toBe("done");
    const original = loadManifest().installations[0];
    for (const word of ["second", "third"]) {
      fs.writeFileSync(path.join(root, "SKILL.md"), `---\nname: transaction\n---\n${word}\n`);
      expect(importTask(task, { overwrite: true, noBackup: false }).status).toBe("done");
    }
    const backups = loadBackupIndex();
    expect(new Set(backups.map((b) => b.backupPath)).size).toBe(2);
    restoreBackup(backups[0]);
    expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("old");
    expect(loadManifest().installations[0]).toEqual(original);
  });
  it("keeps the current version when restore metadata cannot be committed", () => {
    expect(importTask(task, { overwrite: false, noBackup: false }).status).toBe("done");
    fs.writeFileSync(path.join(root, "SKILL.md"), "---\nname: transaction\n---\nnew\n");
    expect(importTask(task, { overwrite: true, noBackup: false }).status).toBe("done");
    const before = fs.readFileSync(manifestFile, "utf8");
    fault.manifestRename = true;
    expect(() => restoreBackup(loadBackupIndex()[0])).toThrow(/injected manifest failure/);
    expect(fs.readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("new");
    expect(fs.readFileSync(manifestFile, "utf8")).toBe(before);
  });
});
