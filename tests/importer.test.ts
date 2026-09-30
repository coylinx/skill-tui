// Tests for the importer: plan(), fresh install, skip-existing,
// overwrite-with-backup, and restore. Uses temp dirs for both the source
// skill and a fake agent skills dir.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { plan, importTask } from "../src/core/importer.js";
import { restoreBackup, loadBackupIndex } from "../src/core/backup.js";
import { skillTargetPath } from "../src/core/paths.js";
import type { ImportTask, Skill } from "../src/types.js";

// The shared test setup redirects CODEX_HOME and SKILL_TUI_HOME to a temp
// root, so these tests exercise the public API without touching user data.

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "imp-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeSkill(name: string, desc: string): Skill {
  const dir = path.join(tmp, "src", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${desc}\n---\n# ${name}\nbody\n`,
  );
  return { id: name, name, dir, description: desc, relativePath: `src/${name}` };
}

describe("plan()", () => {
  it("marks absent targets as skip/no-conflict", () => {
    const skill = makeSkill("plan-fresh", "x");
    const tasks: ImportTask[] = [{ skill, agent: "codex" }];
    const items = plan(tasks, false, false);
    expect(items).toHaveLength(1);
    expect(items[0].exists).toBe(false);
    expect(items[0].action).toBe("skip");
  });

  it("marks existing targets as skip when overwrite is false", () => {
    const skill = makeSkill("plan-exists", "x");
    // pre-create the target so plan() sees it as existing
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const items = plan([{ skill, agent: "codex" }], false, false);
      expect(items[0].exists).toBe(true);
      expect(items[0].action).toBe("skip");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("marks existing targets as overwrite when overwrite is true", () => {
    const skill = makeSkill("plan-ow", "x");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const items = plan([{ skill, agent: "codex" }], true, false);
      expect(items[0].exists).toBe(true);
      expect(items[0].action).toBe("overwrite");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});

describe("importTask() fresh install", () => {
  it("copies a skill into the agent dir and validates", () => {
    const skill = makeSkill("imp-fresh-xyz", "fresh install test");
    const target = skillTargetPath("codex", skill.name);
    try {
      const res = importTask({ skill, agent: "codex" }, { overwrite: false, noBackup: false });
      expect(res.status).toBe("done");
      expect(existsSync(path.join(target, "SKILL.md"))).toBe(true);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("skips when target exists and overwrite is false", () => {
    const skill = makeSkill("imp-skip-xyz", "skip test");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold\n");
    try {
      const res = importTask({ skill, agent: "codex" }, { overwrite: false, noBackup: false });
      expect(res.status).toBe("skipped");
      expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("old");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("does not leave a partial target when staged validation fails", () => {
    const skill = makeSkill("imp-invalid-xyz", "invalid test");
    const target = skillTargetPath("codex", skill.name);
    rmSync(path.join(skill.dir, "SKILL.md"));
    try {
      const res = importTask({ skill, agent: "codex" }, { overwrite: false, noBackup: false });
      expect(res.status).toBe("failed");
      expect(res.message).toMatch(/SKILL\.md/);
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("overwrites with backup when overwrite is true", () => {
    const skill = makeSkill("imp-ow-xyz", "overwrite test");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\nold-content\n");
    try {
      const res = importTask({ skill, agent: "codex" }, { overwrite: true, noBackup: false });
      expect(res.status).toBe("done");
      expect(res.action).toBe("overwrite");
      expect(res.backupPath).toBeTruthy();
      // new content in place
      expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("overwrite test");
      // backup retained the old content
      expect(existsSync(res.backupPath!)).toBe(true);
      expect(readFileSync(path.join(res.backupPath!, "SKILL.md"), "utf8")).toContain("old-content");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("keeps the original target when a replacement fails validation", () => {
    const skill = makeSkill("imp-rollback-xyz", "rollback test");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\noriginal-content\n");
    rmSync(path.join(skill.dir, "SKILL.md"));
    try {
      const res = importTask({ skill, agent: "codex" }, { overwrite: true, noBackup: true });
      expect(res.status).toBe("failed");
      expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("original-content");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});

describe("backup + restore", () => {
  it("records a backup in the index and can restore it", () => {
    const skill = makeSkill("imp-restore-xyz", "restore test");
    const target = skillTargetPath("codex", skill.name);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "SKILL.md"), "---\n---\noriginal\n");
    try {
      const res = importTask({ skill, agent: "codex" }, { overwrite: true, noBackup: false });
      expect(res.backupPath).toBeTruthy();

      const records = loadBackupIndex();
      const rec = records.find((r) => r.backupPath === res.backupPath);
      expect(rec).toBeTruthy();

      // overwrite again to a different value, then restore the first backup
      writeFileSync(path.join(target, "SKILL.md"), "---\n---\nnewer\n");
      restoreBackup(rec!);
      expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toContain("original");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});
