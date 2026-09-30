import { afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Keep every test file away from the user's real agent and backup folders.
// Vitest isolates test-file module graphs, so paths.ts observes these values
// before it computes its module-level constants.
const testRoot = mkdtempSync(path.join(tmpdir(), "skill-tui-vitest-"));
process.env.SKILL_TUI_HOME = path.join(testRoot, "data");
process.env.CODEX_HOME = path.join(testRoot, "codex");

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true });
});
