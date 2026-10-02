// Deterministic file-level diff for update previews.
import type { FileChange, SkillFileDigest } from "../types.js";

export function diffFiles(before: SkillFileDigest[], after: SkillFileDigest[]): FileChange[] {
  const oldFiles = new Map(before.map((file) => [file.path, file]));
  const newFiles = new Map(after.map((file) => [file.path, file]));
  const paths = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
  const changes: FileChange[] = [];
  for (const filePath of paths) {
    const oldFile = oldFiles.get(filePath);
    const newFile = newFiles.get(filePath);
    if (!oldFile && newFile) changes.push({ path: filePath, kind: "added", after: newFile });
    else if (oldFile && !newFile) changes.push({ path: filePath, kind: "removed", before: oldFile });
    else if (oldFile && newFile && (oldFile.sha256 !== newFile.sha256 || oldFile.size !== newFile.size)) {
      changes.push({ path: filePath, kind: "modified", before: oldFile, after: newFile });
    }
  }
  return changes;
}
