// Cross-platform path helpers.
// ~/.skill-tui/ is our own data root (cache, backups, history, index).
//
// Agent skill paths are env-aware (v0.3.0):
//   Codex:     respects CODEX_HOME
//   Hermes:    respects HERMES_HOME; Windows uses %LOCALAPPDATA%\hermes
//   OpenCode:  respects OPENCODE_CONFIG_DIR and XDG_CONFIG_HOME
// All other agents (Claude Code, Cursor, ZCode, OpenClaw) use ~/.<name>/skills/
// identically across macOS / Linux / Windows.

import os from "node:os";
import path from "node:path";

const home = os.homedir();

/** Root for all skill-tui data: cache, backups, history, index.
 *  SKILL_TUI_HOME is primarily useful for isolated automation and tests. */
export const dataRoot = process.env.SKILL_TUI_HOME?.trim()
  ? process.env.SKILL_TUI_HOME
  : path.join(home, ".skill-tui");

/** Cloned repos live here, keyed by a hash of their URL. */
export const cacheDir = path.join(dataRoot, "cache");

/** Backups taken before overwriting an installed skill. */
export const backupDir = path.join(dataRoot, "backup");

/** URL history for the input screen (↑/↓ to recall). */
export const historyFile = path.join(dataRoot, "history.json");

/** Backup index recording metadata for restore. */
export const backupIndexFile = path.join(backupDir, "index.json");

/** Versioned installation records. */
export const manifestFile = path.join(dataRoot, "manifest.json");

// --- Env-aware agent root resolvers (exported for testing) ---

/** Codex: respects CODEX_HOME env var. */
export function codexRoot(): string {
  const env = process.env.CODEX_HOME;
  return env && env.trim() ? env : path.join(home, ".codex");
}

/** Hermes: respects HERMES_HOME; Windows uses %LOCALAPPDATA%\hermes. */
export function hermesRoot(): string {
  const env = process.env.HERMES_HOME;
  if (env && env.trim()) return env;
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(localAppData, "hermes");
  }
  return path.join(home, ".hermes");
}

/** OpenCode: respects OPENCODE_CONFIG_DIR (highest priority), then XDG_CONFIG_HOME,
 *  then ~/.config/opencode. Uses `||` (not `??`) so empty-string XDG falls back. */
export function opencodeSkillsDir(): string {
  const override = process.env.OPENCODE_CONFIG_DIR;
  if (override && override.trim()) return path.join(override, "skills");
  const xdg = process.env.XDG_CONFIG_HOME;
  const configRoot = xdg && xdg.trim() ? xdg : path.join(home, ".config");
  return path.join(configRoot, "opencode", "skills");
}

/** Per-agent skill directories (global level).
 *  All agents are Tier-1: copy <skill>/ to <skillsDir>/<name>/ and it works.
 *  Paths are computed at module load with env-var awareness. */
export const agentSkillsDirs: Record<string, string> = {
  claude: path.join(home, ".claude", "skills"),
  codex: path.join(codexRoot(), "skills"),
  cursor: path.join(home, ".cursor", "skills"),
  zcode: path.join(home, ".zcode", "skills"),
  openclaw: path.join(home, ".openclaw", "skills"),
  hermes: path.join(hermesRoot(), "skills"),
  opencode: opencodeSkillsDir(),
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
