// Prepare the complete replacement beside the target before moving any old data.
import { cpSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export function pathExists(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

interface ReplaceOptions {
  copy?: (source: string, target: string) => void;
  validate?: (staged: string) => void;
  beforeReplace?: () => void;
}

export function replaceDirectory(source: string, target: string, options: ReplaceOptions = {}): void {
  const parent = path.dirname(target);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(path.join(parent, ".skill-tui-"));
  const next = path.join(staging, "new");
  const previous = path.join(staging, "previous");
  let movedPrevious = false;
  let keepStaging = false;
  try {
    if (options.copy) options.copy(source, next);
    else cpSync(source, next, { recursive: true, verbatimSymlinks: true });
    options.validate?.(next);
    options.beforeReplace?.();
    if (pathExists(target)) {
      renameSync(target, previous);
      movedPrevious = true;
    }
    try {
      renameSync(next, target);
    } catch (error) {
      if (movedPrevious) {
        try {
          renameSync(previous, target);
        } catch {
          keepStaging = true;
          throw new Error(`替换失败，原目录保留在：${previous}`, { cause: error });
        }
      }
      throw error;
    }
  } finally {
    if (!keepStaging) {
      // Cleanup must not turn a successful commit into a reported failure.
      try { rmSync(staging, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}
