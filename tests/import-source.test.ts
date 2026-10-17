import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

vi.mock("../src/core/repo.js", () => ({ cloneRepo: vi.fn() }));

import { loadImportSource, resolveSourceInput } from "../src/core/import-source.js";
import { cloneRepo } from "../src/core/repo.js";
import { cacheDir, manifestFile } from "../src/core/paths.js";

let root: string;
beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(path.join(tmpdir(), "import-source-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function fixture(parent: string) {
  const dir = path.join(parent, "skills", "sample");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), "---\nname: sample\ndescription: fixture\n---\nbody\n");
  return dir;
}

describe("import source resolution", () => {
  it.each(["owner/repo", "github:owner/repo", "owner/repo.git"])("normalizes %s", (input) => {
    expect(resolveSourceInput(input, { cwd: root })).toEqual({ kind: "git", location: "https://github.com/owner/repo.git" });
  });

  it.each(["https://gitlab.com/team/repo.git", "ssh://git@example.com/team/repo.git", "git@example.com:team/repo.git"])("preserves Git transport %s", (input) => {
    expect(resolveSourceInput(input)).toEqual({ kind: "git", location: input });
  });

  it("prefers an existing local owner/repo directory over GitHub shorthand", () => {
    mkdirSync(path.join(root, "owner", "repo"), { recursive: true });
    expect(resolveSourceInput("owner/repo", { cwd: root })).toEqual({ kind: "local", location: path.join(root, "owner", "repo") });
    expect(resolveSourceInput("github:owner/repo", { cwd: root }).kind).toBe("git");
  });

  it("resolves relative, home, file URL, and absolute paths with spaces", () => {
    const dir = path.join(root, "my skills");
    const expected = { kind: "local", location: dir };
    expect(resolveSourceInput("./my skills", { cwd: root })).toEqual(expected);
    expect(resolveSourceInput("~/my skills", { home: root })).toEqual(expected);
    expect(resolveSourceInput(dir)).toEqual(expected);
    expect(resolveSourceInput(pathToFileURL(dir).href)).toEqual(expected);
    expect(resolveSourceInput(".", { cwd: root })).toEqual({ kind: "local", location: root });
  });

  it("handles Windows drive paths, UNC shares, home expansion, and file URLs", () => {
    const options = { platform: "win32" as const, cwd: "C:\\work", home: "C:\\Users\\Jane Doe" };
    expect(resolveSourceInput(".\\my skills", options).location).toBe("C:\\work\\my skills");
    expect(resolveSourceInput("C:\\my skills", options).location).toBe("C:\\my skills");
    expect(resolveSourceInput("\\\\server\\share\\skills", options).location).toBe("\\\\server\\share\\skills");
    expect(resolveSourceInput("~/skills", options).location).toBe("C:\\Users\\Jane Doe\\skills");
    expect(resolveSourceInput("file:///C:/my%20skills", options).location).toBe("C:\\my skills");
  });

  it.each(["", "--upload-pack=evil", "github:owner", "github:owner/repo/extra", "github:owner/..", "github:owner/.git", "not-a-source", "https://", "owner/repo\nother"])("rejects invalid input with a correction hint: %s", (input) => {
    expect(() => resolveSourceInput(input, { cwd: root })).toThrow(/Git|目录/);
  });
});

describe("source discovery and provenance", () => {
  it("reads local Skills in place without Git, cache, or manifest writes", async () => {
    const dir = fixture(root);
    const result = await loadImportSource(resolveSourceInput(root));
    expect(result.dir).toBe(root);
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].dir).toBe(dir);
    expect(result.skills[0].source).toEqual({ kind: "local", location: root, relativePath: "skills/sample", commit: null });
    expect(cloneRepo).not.toHaveBeenCalled();
    expect(existsSync(cacheDir)).toBe(false);
    expect(existsSync(manifestFile)).toBe(false);
  });

  it("also accepts a single Skill directory as the source", async () => {
    const dir = fixture(root);
    const result = await loadImportSource(resolveSourceInput(dir));
    expect(result.skills[0].source).toEqual({ kind: "local", location: dir, relativePath: ".", commit: null });
  });

  it("clones normalized Git sources and records credential-free provenance", async () => {
    fixture(root);
    const commit = "a".repeat(40);
    vi.mocked(cloneRepo).mockResolvedValue({ dir: root, cached: false, commit });
    const input = "https://user:secret@example.com/skills.git?token=secret#ref";
    const result = await loadImportSource(resolveSourceInput(input));
    expect(cloneRepo).toHaveBeenCalledWith(input, undefined);
    expect(result.skills[0].source).toEqual({ kind: "git", location: "https://example.com/skills.git", relativePath: "skills/sample", commit });
  });

  it("reports missing directories and files without falling back to a clone", async () => {
    await expect(loadImportSource(resolveSourceInput(path.join(root, "missing")))).rejects.toThrow(/检查目录路径/);
    const file = path.join(root, "file.txt");
    writeFileSync(file, "file");
    await expect(loadImportSource(resolveSourceInput(file))).rejects.toThrow(/来源不是目录/);
    expect(cloneRepo).not.toHaveBeenCalled();
  });

  it("does no work for an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(loadImportSource(resolveSourceInput("owner/repo"), controller.signal)).rejects.toThrow();
    expect(cloneRepo).not.toHaveBeenCalled();
  });
});
