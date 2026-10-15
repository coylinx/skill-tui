import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/index.tsx", ...args], {
    encoding: "utf8",
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

describe("CLI without a terminal", () => {
  it("shows help without terminal escape codes", () => {
    const result = cli("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("skilltui [git-url] [options]");
    expect(result.stdout).not.toContain("\x1b");
    expect(result.stderr).toBe("");
  });

  it("prints the package version", () => {
    const result = cli("--version");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("skilltui 0.3.1");
  });

  it.each([["--unknown"], ["first-url", "second-url"], []])("rejects invalid invocation %j cleanly", (...args) => {
    const result = cli(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("skilltui");
    expect(result.stderr).not.toContain("Raw mode is not supported");
    expect(result.stdout).not.toContain("\x1b");
  });
});
