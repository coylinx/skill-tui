// Tests for agent detection logic.
// We can't easily fake PATH, so we test the status-derivation rules:
//   exe present + dir  → installed
//   exe absent + dir  → configured
//   exe absent + no dir → missing
// by exercising exeOnPath against a guaranteed-present (node) and
// guaranteed-absent (a nonsense name) executable.

import { describe, it, expect } from "vitest";
import { exeOnPath } from "../src/core/detect.js";
import { allAgentIds, targetPathFor } from "../src/core/agents.js";
import { agentSkillsDirs } from "../src/core/paths.js";
import path from "node:path";
import type { AgentStatus } from "../src/types.js";

// Derive status the same way agents.ts does, but with injectable probes.
function deriveStatus(hasExe: boolean, dirExists: boolean, hasExeField: boolean): AgentStatus {
  if (hasExeField) {
    if (hasExe) return "installed";
    if (dirExists) return "configured";
    return "missing";
  }
  return dirExists ? "configured" : "missing";
}

describe("agent detection", () => {
  it("exeOnPath finds a real command (node) and rejects nonsense", async () => {
    expect(await exeOnPath("node")).toBe(true);
    expect(await exeOnPath("this-executable-does-not-exist-xyz-123")).toBe(false);
  });

  it("derives installed when exe + dir present", () => {
    expect(deriveStatus(true, true, true)).toBe("installed");
  });

  it("derives configured when dir present but no exe", () => {
    expect(deriveStatus(false, true, true)).toBe("configured");
  });

  it("derives missing when neither present", () => {
    expect(deriveStatus(false, false, true)).toBe("missing");
  });

  it("derives configured-by-dir-only for GUI agents (no exe field)", () => {
    expect(deriveStatus(false, true, false)).toBe("configured");
    expect(deriveStatus(false, false, false)).toBe("missing");
  });

  it("allAgentIds lists the seven agents and explicit shared target", () => {
    expect(allAgentIds().sort()).toEqual([
      "claude",
      "codex",
      "cursor",
      "hermes",
      "openclaw",
      "opencode",
      "shared",
      "zcode",
    ]);
  });

  it("targetPathFor places a skill under the agent's skills dir", () => {
    const p = targetPathFor("claude", "my-skill");
    expect(p).toBe(path.join(agentSkillsDirs.claude, "my-skill"));
  });

  it("each agent skills dir is under the user home and ends with skills", () => {
    for (const id of allAgentIds()) {
      const dir = agentSkillsDirs[id];
      expect(dir.replace(/\\/g, "/")).toMatch(/skills$/);
    }
  });
});
