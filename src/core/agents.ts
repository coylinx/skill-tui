// Agent registry with three-state installation detection.
//   installed  — executable on PATH (success)
//   configured — config/skills dir exists but no executable (warning)
//   missing    — neither (danger); still selectable with a warning.
//
// All agents are Tier-1: pure directory copy to <skills>/<name>/SKILL.md.
// Env-aware paths (handled in paths.ts, v0.3.0):
//   Codex     — respects CODEX_HOME
//   Hermes    — respects HERMES_HOME; Windows uses %LOCALAPPDATA%\hermes
//   OpenCode  — respects OPENCODE_CONFIG_DIR and XDG_CONFIG_HOME
// OpenClaw discovers from ~/.openclaw/skills/ and ~/.agents/skills/.
// OpenCode also auto-discovers ~/.claude/skills/ and ~/.agents/skills/.

import { existsSync } from "node:fs";
import path from "node:path";
import { agentSkillsDirs, skillTargetPath } from "./paths.js";
import { exeOnPath } from "./detect.js";
import type { AgentId, AgentStatus } from "../types.js";

export interface AgentInfo {
  id: AgentId;
  label: string;
  exe: string; // "" means detect by config dir only (e.g. Cursor GUI app)
  skillsDir: string;
  status: AgentStatus;
  /** Note shown next to the path if the agent has extra discovery paths. */
  note?: string;
}

const DEFS: Omit<AgentInfo, "status">[] = [
  { id: "claude", label: "Claude Code", exe: "claude", skillsDir: agentSkillsDirs.claude },
  { id: "codex", label: "Codex", exe: "codex", skillsDir: agentSkillsDirs.codex },
  { id: "zcode", label: "ZCode", exe: "zcode", skillsDir: agentSkillsDirs.zcode },
  { id: "cursor", label: "Cursor", exe: "cursor", skillsDir: agentSkillsDirs.cursor },
  { id: "openclaw", label: "OpenClaw", exe: "openclaw", skillsDir: agentSkillsDirs.openclaw },
  { id: "hermes", label: "Hermes", exe: "hermes", skillsDir: agentSkillsDirs.hermes },
  { id: "opencode", label: "OpenCode", exe: "opencode", skillsDir: agentSkillsDirs.opencode },
  { id: "shared", label: "共享目录", exe: "", skillsDir: agentSkillsDirs.shared,
    note: " · Codex / OpenCode / OpenClaw（默认配置）" },
];

export function allAgentIds(): AgentId[] {
  return DEFS.map((d) => d.id);
}

/** Probe every agent's installation state. Runs exe + config-dir checks. */
export async function probeAgents(): Promise<AgentInfo[]> {
  const results: AgentInfo[] = [];
  for (const def of DEFS) {
    const dirExists = existsSync(def.skillsDir);
    let status: AgentStatus;
    if (def.exe) {
      const hasExe = await exeOnPath(def.exe);
      if (hasExe) status = "installed";
      else if (dirExists) status = "configured";
      else status = "missing";
    } else {
      // GUI app (Cursor): config dir is the primary signal.
      status = dirExists ? "configured" : "missing";
    }
    results.push({ ...def, status });
  }
  return results;
}

/** Resolve where a skill would be installed for an agent. */
export function targetPathFor(agent: AgentId, skillName: string): string {
  return skillTargetPath(agent, skillName);
}

/** Relative display path (swap home for ~) for compact UI. */
export function displayPath(abs: string): string {
  const home = path.dirname(path.dirname(agentSkillsDirs.claude));
  return abs === home || abs.startsWith(home + path.sep)
    ? "~" + abs.slice(home.length).replace(/\\/g, "/") : abs;
}
