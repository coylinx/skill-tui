import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export function tempSibling(targetPath: string, purpose: "stage" | "rollback"): string {
  return path.join(path.dirname(targetPath),
    `.${path.basename(targetPath)}.skill-tui-${purpose}-${process.pid}-${randomUUID()}`);
}

export function removeQuietly(targetPath: string | undefined): void {
  if (!targetPath) return;
  try { fs.rmSync(targetPath, { recursive: true, force: true }); }
  catch { /* Preserve the original operation's error. */ }
}

/** Keep the old directory until both the replacement and metadata commit succeed.
 * Caller owns the manifest lock and prepares/validates the staged directory. */
export function replaceTarget(stagedPath: string, targetPath: string, commit: () => void): string | undefined {
  const rollbackPath = tempSibling(targetPath, "rollback");
  let originalMoved = false;
  let replacementMoved = false;
  try {
    if (fs.existsSync(targetPath)) {
      fs.renameSync(targetPath, rollbackPath);
      originalMoved = true;
    }
    fs.renameSync(stagedPath, targetPath);
    replacementMoved = true;
    commit();
  } catch (error) {
    try {
      if (replacementMoved) fs.rmSync(targetPath, { recursive: true, force: true });
      if (originalMoved) fs.renameSync(rollbackPath, targetPath);
    } catch (rollbackError) {
      throw new Error(`${(error as Error).message}；自动回滚失败：${(rollbackError as Error).message}；旧版本位置：${rollbackPath}`);
    } finally { removeQuietly(stagedPath); }
    throw error;
  }
  if (originalMoved) {
    try { fs.rmSync(rollbackPath, { recursive: true, force: true }); }
    catch (error) { return `操作成功，但临时旧版本清理失败：${(error as Error).message}`; }
  }
  return undefined;
}
