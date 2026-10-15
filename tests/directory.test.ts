import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { replaceDirectory } from "../src/core/directory.js";

let root: string;
let source: string;
let target: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "skill-tui-replace-"));
  source = path.join(root, "source");
  target = path.join(root, "target");
  mkdirSync(source);
  mkdirSync(target);
  writeFileSync(path.join(source, "SKILL.md"), "new");
  writeFileSync(path.join(target, "SKILL.md"), "old");
  writeFileSync(path.join(target, "old-only.txt"), "original extra file");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("staged directory replacement", () => {
  it("rolls back the entire old directory if committing the replacement fails", () => {
    let staged = "";
    expect(() => replaceDirectory(source, target, {
      validate: (dir) => { staged = dir; },
      // Simulate the staged payload becoming unavailable at commit time.
      beforeReplace: () => rmSync(staged, { recursive: true }),
    })).toThrow();
    expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("old");
    expect(readFileSync(path.join(target, "old-only.txt"), "utf8")).toBe("original extra file");
    expect(readdirSync(root).sort()).toEqual(["source", "target"]);
  });

  it("keeps the old directory when backup preparation fails", () => {
    expect(() => replaceDirectory(source, target, {
      beforeReplace: () => { throw new Error("backup unavailable"); },
    })).toThrow("backup unavailable");
    expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("old");
    expect(readdirSync(root).sort()).toEqual(["source", "target"]);
  });

  it("replaces the directory without retaining obsolete files", () => {
    replaceDirectory(source, target);
    expect(readFileSync(path.join(target, "SKILL.md"), "utf8")).toBe("new");
    expect(existsSync(path.join(target, "old-only.txt"))).toBe(false);
    expect(readdirSync(root).sort()).toEqual(["source", "target"]);
  });
});
