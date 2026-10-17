// Installation metadata is strict and atomically replaced. An unreadable or
// unsupported manifest must never be silently reset during a write.
import * as fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { agentSkillsDirs, manifestFile } from "./paths.js";
import type { InstallManifest, InstallationRecord, ImportTask, SkillFileDigest, SkillSource } from "../types.js";

const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const skippedDirs = new Set([".git", "node_modules"]);

export function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function installationId(agent: string, targetPath: string): string {
  return createHash("sha256").update(`${agent}\0${canonicalPath(targetPath)}`).digest("hex");
}

/** Remove authentication components before persisting repository provenance. */
export function sourceLocation(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value; // Git scp syntax and local paths
  }
}

/** Deterministic content hashes, excluding the same directories as the copier.
 * Links are rejected rather than hashing data outside the skill directory. */
export function snapshotFiles(root: string): SkillFileDigest[] {
  const files: SkillFileDigest[] = [];
  function walk(dir: string) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (skippedDirs.has(name)) continue;
      const file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`无法记录符号链接：${path.relative(root, file)}`);
      if (stat.isDirectory()) walk(file);
      else if (stat.isFile()) {
        const data = fs.readFileSync(file);
        files.push({ path: path.relative(root, file).replace(/\\/g, "/"), size: data.length,
          sha256: createHash("sha256").update(data).digest("hex") });
      } else throw new Error(`不支持的文件类型：${file}`);
    }
  }
  walk(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function contentHash(files: SkillFileDigest[]): string {
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function date(value: unknown): boolean {
  return text(value) && Number.isFinite(Date.parse(value));
}
function relativeFile(value: unknown): boolean {
  return text(value) && !value.includes("\\") && !value.startsWith("/") &&
    !value.includes(":") && value.split("/").every((p) => p !== ".." && p !== "." && p !== "");
}

export function validateInstallation(value: unknown): asserts value is InstallationRecord {
  if (!object(value) || !text(value.agent) || !Object.hasOwn(agentSkillsDirs, value.agent) ||
    !text(value.installName) || /[\\/:]/.test(value.installName) || [".", ".."].includes(value.installName) ||
    !text(value.targetPath) || !path.isAbsolute(value.targetPath) ||
    value.id !== installationId(value.agent, value.targetPath) || !text(value.skillId) ||
    !date(value.installedAt) || !date(value.updatedAt) || !text(value.contentHash) || !SHA.test(value.contentHash) ||
    !object(value.source) || !["git", "local"].includes(String(value.source.kind)) ||
    !text(value.source.location) || !text(value.source.relativePath) ||
    !(value.source.commit === null || (text(value.source.commit) && COMMIT.test(value.source.commit))) ||
    !Array.isArray(value.files)) {
    throw new Error("安装记录格式无效");
  }
  const names = new Set<string>();
  for (const file of value.files) {
    if (!object(file) || !relativeFile(file.path) || typeof file.size !== "number" ||
      !Number.isSafeInteger(file.size) || file.size < 0 || !text(file.sha256) || !SHA.test(file.sha256) ||
      names.has(String(file.path))) throw new Error("安装记录文件摘要无效或重复");
    names.add(String(file.path));
  }
  if (contentHash(value.files as SkillFileDigest[]) !== value.contentHash) {
    throw new Error("安装记录内容摘要不匹配");
  }
}

export function validateManifest(value: unknown): asserts value is InstallManifest {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.installations)) {
    throw new Error("不支持或无效的 manifest schema（需要 schemaVersion=1）");
  }
  const ids = new Set<string>();
  for (const record of value.installations) {
    validateInstallation(record);
    if (ids.has(record.id)) throw new Error("manifest 包含重复安装记录");
    ids.add(record.id);
  }
}

export function loadManifest(file = manifestFile): InstallManifest {
  let raw: string;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, installations: [] };
    throw new Error(`无法读取 manifest：${(error as Error).message}`);
  }
  try {
    const value: unknown = JSON.parse(raw);
    validateManifest(value);
    return value;
  } catch (error) { throw new Error(`manifest 无效：${(error as Error).message}`); }
}

function writeAtomic(doc: InstallManifest, file: string): void {
  validateManifest(doc);
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle: number | undefined;
  try {
    handle = fs.openSync(tmp, "wx", 0o600);
    fs.writeFileSync(handle, JSON.stringify(doc, null, 2) + "\n", "utf8");
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(tmp, file);
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

/** A process-wide disk lock covers target changes and metadata changes.
 * A stale lock is surfaced for diagnosis; never guess that another writer died. */
export function withManifestLock<T>(
  run: (doc: InstallManifest, commit: (next: InstallManifest) => void) => T,
  file = manifestFile,
): T {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let handle: number;
  try { handle = fs.openSync(lock, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`manifest 正在写入或遗留锁未清理：${lock}`);
    }
    throw error;
  }
  try {
    fs.writeFileSync(handle, String(process.pid), "utf8");
    return run(loadManifest(file), (next) => writeAtomic(next, file));
  } finally {
    fs.closeSync(handle);
    fs.unlinkSync(lock);
  }
}

export function createInstallation(
  task: ImportTask, targetPath: string, stagedPath: string, previous?: InstallationRecord,
): InstallationRecord {
  const now = new Date().toISOString();
  const source: SkillSource = task.skill.source
    ? { ...task.skill.source, location: task.skill.source.kind === "git"
      ? sourceLocation(task.skill.source.location) : path.resolve(task.skill.source.location) }
    : { kind: "local", location: path.resolve(task.skill.dir), relativePath: ".", commit: null };
  const files = snapshotFiles(stagedPath);
  const record: InstallationRecord = {
    id: installationId(task.agent, targetPath), skillId: task.skill.id,
    installName: task.skill.installName ?? task.skill.name, agent: task.agent,
    targetPath: path.resolve(targetPath), source, installedAt: previous?.installedAt ?? now,
    updatedAt: now, files, contentHash: contentHash(files),
  };
  validateInstallation(record);
  return record;
}
