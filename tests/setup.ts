// Each test file gets a disposable home. Never install into the real agent dirs.
import { afterAll, afterEach, vi } from "vitest";
import { cleanup } from "ink-testing-library";
import { rmSync } from "node:fs";
import { homedir } from "node:os";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const home = mkdtempSync(join(actual.tmpdir(), "skill-tui-test-home-"));
  return { ...actual, homedir: () => home, default: { ...actual.default, homedir: () => home } };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => rmSync(homedir(), { recursive: true, force: true }));
