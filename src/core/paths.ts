// Cross-platform path helpers.
// ~/.skill-tui/ is our own data root (cache, backups, history, index).

import os from "node:os";
import path from "node:path";

const home = os.homedir();

/** Root for all skill-tui data: cache, backups, history, index. */
export const dataRoot = path.join(home, ".skill-tui");

/** Cloned repos live here, keyed by a hash of their URL. */
export const cacheDir = path.join(dataRoot, "cache");

/** Backups taken before overwriting an installed skill. */
export const backupDir = path.join(dataRoot, "backup");

/** URL history for the input screen (↑/↓ to recall). */
export const historyFile = path.join(dataRoot, "history.json");

/** Backup index recording metadata for restore. */
export const backupIndexFile = path.join(backupDir, "index.json");

/** Per-agent skill directories (global level).
 *  All agents are Tier-1: copy <skill>/ to <skillsDir>/<name>/ and it works.
 *  OpenClaw discovers from ~/.openclaw/skills/ and ~/.agents/skills/.
 *  Hermes uses ~/.hermes/skills/ (with optional <category>/ nesting).
 *  OpenCode also recognizes ~/.claude/skills/ and ~/.agents/skills/ in addition
 *  to its own ~/.config/opencode/skills/.
 *  ~/.agents/skills/ is a cross-agent alias recognized by OpenClaw, OpenCode, and Codex.
 */
export const agentSkillsDirs: Record<string, string> = {
  claude: path.join(home, ".claude", "skills"),
  codex: path.join(home, ".codex", "skills"),
  cursor: path.join(home, ".cursor", "skills"),
  zcode: path.join(home, ".zcode", "skills"),
  openclaw: path.join(home, ".openclaw", "skills"),
  hermes: path.join(home, ".hermes", "skills"),
  opencode: path.join(home, ".config", "opencode", "skills"),
};

/** Resolve a skill's target directory for a given agent. */
export function skillTargetPath(agent: string, skillName: string): string {
  return path.join(agentSkillsDirs[agent], skillName);
}

/** Stable 12-char hex id for a repo URL (used as cache subdir name). */
export async function urlHash(url: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(url).digest("hex").slice(0, 12);
}
