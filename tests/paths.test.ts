// Tests for env-aware path resolution (v0.3.0).
// Imports the actual resolver functions from paths.ts — NOT replicates.
// Verifies CODEX_HOME, HERMES_HOME, XDG_CONFIG_HOME, OPENCODE_CONFIG_DIR
// and Hermes Windows LOCALAPPDATA all produce correct skill paths.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { codexRoot, hermesRoot, opencodeSkillsDir, agentSkillsDirs, skillTargetPath } from "../src/core/paths.js";

const home = os.homedir();

describe("env-aware paths (imported from paths.ts)", () => {
  it.each(["", ".", "..", "../escape", "nested/skill", "nested\\skill", "bad\0name"])(
    "rejects invalid install folder %j", (name) => {
      expect(() => skillTargetPath("claude", name)).toThrow("无效的安装名称");
    },
  );

  it("rejects unknown agents", () => {
    expect(() => skillTargetPath("unknown", "skill")).toThrow("未知 Agent");
  });
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ["CODEX_HOME", "HERMES_HOME", "XDG_CONFIG_HOME", "OPENCODE_CONFIG_DIR", "LOCALAPPDATA"]) {
      saved[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe("Codex (CODEX_HOME)", () => {
    it("uses ~/.codex by default", () => {
      delete process.env.CODEX_HOME;
      expect(codexRoot()).toBe(path.join(home, ".codex"));
    });

    it("respects CODEX_HOME when set", () => {
      process.env.CODEX_HOME = "/custom/codex";
      expect(codexRoot()).toBe("/custom/codex");
    });

    it("ignores empty CODEX_HOME", () => {
      process.env.CODEX_HOME = "  ";
      expect(codexRoot()).toBe(path.join(home, ".codex"));
    });

    it("skill dir is codexRoot/skills", () => {
      process.env.CODEX_HOME = "/custom/codex";
      expect(path.join(codexRoot(), "skills")).toBe(path.join("/custom/codex", "skills"));
    });
  });

  describe("Hermes (HERMES_HOME + Windows)", () => {
    it("uses ~/.hermes by default on macOS/Linux", () => {
      delete process.env.HERMES_HOME;
      if (process.platform !== "win32") {
        expect(hermesRoot()).toBe(path.join(home, ".hermes"));
      }
    });

    it("respects HERMES_HOME when set", () => {
      process.env.HERMES_HOME = "/custom/hermes";
      expect(hermesRoot()).toBe("/custom/hermes");
    });

    it("ignores empty HERMES_HOME", () => {
      process.env.HERMES_HOME = "  ";
      if (process.platform !== "win32") {
        expect(hermesRoot()).toBe(path.join(home, ".hermes"));
      }
    });

    it("skill dir is hermesRoot/skills", () => {
      process.env.HERMES_HOME = "/custom/hermes";
      expect(path.join(hermesRoot(), "skills")).toBe(path.join("/custom/hermes", "skills"));
    });

    it("Windows uses LOCALAPPDATA when HERMES_HOME unset", () => {
      if (process.platform === "win32") {
        delete process.env.HERMES_HOME;
        process.env.LOCALAPPDATA = "C:\\Users\\test\\AppData\\Local";
        expect(hermesRoot()).toBe(path.join("C:\\Users\\test\\AppData\\Local", "hermes"));
      }
    });
  });

  describe("OpenCode (XDG_CONFIG_HOME + OPENCODE_CONFIG_DIR)", () => {
    it("uses ~/.config/opencode/skills by default", () => {
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.OPENCODE_CONFIG_DIR;
      expect(opencodeSkillsDir()).toBe(path.join(home, ".config", "opencode", "skills"));
    });

    it("respects XDG_CONFIG_HOME when set", () => {
      delete process.env.OPENCODE_CONFIG_DIR;
      process.env.XDG_CONFIG_HOME = "/custom/xdg";
      expect(opencodeSkillsDir()).toBe(path.join("/custom/xdg", "opencode", "skills"));
    });

    it("respects OPENCODE_CONFIG_DIR over XDG_CONFIG_HOME", () => {
      process.env.OPENCODE_CONFIG_DIR = "/custom/opencode";
      process.env.XDG_CONFIG_HOME = "/custom/xdg";
      expect(opencodeSkillsDir()).toBe(path.join("/custom/opencode", "skills"));
    });

    it("ignores empty XDG_CONFIG_HOME (falls back to ~/.config)", () => {
      delete process.env.OPENCODE_CONFIG_DIR;
      process.env.XDG_CONFIG_HOME = "  ";
      expect(opencodeSkillsDir()).toBe(path.join(home, ".config", "opencode", "skills"));
    });

    it("ignores empty OPENCODE_CONFIG_DIR", () => {
      process.env.OPENCODE_CONFIG_DIR = "  ";
      process.env.XDG_CONFIG_HOME = "/custom/xdg";
      expect(opencodeSkillsDir()).toBe(path.join("/custom/xdg", "opencode", "skills"));
    });
  });

  describe("agentSkillsDirs (module-level constant)", () => {
    it("contains all 7 agents", () => {
      expect(Object.keys(agentSkillsDirs).sort()).toEqual([
        "claude", "codex", "cursor", "hermes", "openclaw", "opencode", "zcode",
      ]);
    });

    it("all skill dirs end with /skills", () => {
      for (const dir of Object.values(agentSkillsDirs)) {
        expect(dir.replace(/\\/g, "/")).toMatch(/skills$/);
      }
    });
  });
});
