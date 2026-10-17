import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";

vi.mock("../src/core/agents.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/agents.js")>();
  return { ...actual, probeAgents: vi.fn(async () => [
    { id: "shared", label: "共享目录", exe: "", skillsDir: "/fixture/.agents/skills", status: "missing",
      note: " · Codex / OpenCode / OpenClaw（默认配置）" },
    { id: "codex", label: "Codex", exe: "codex", skillsDir: "/fixture/.codex/skills", status: "installed" },
  ]) };
});

import { AgentSelect } from "../src/components/agent-select.js";
const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("AgentSelect shared target", () => {
  it("requires explicit selection and warns when a shared and individual directory are selected", async () => {
    const confirmed = vi.fn();
    const { stdin, lastFrame, unmount } = render(<AgentSelect onConfirm={confirmed} onBack={() => {}} />);
    try {
      await flush();
      expect(lastFrame()).toContain("已选 0/2");
      expect(lastFrame()).toContain("共享目录 · 跨 Agent");
      expect(lastFrame()).toContain("默认配置的 OpenClaw");
      await flush();
      stdin.write("\r");
      await vi.waitFor(() => expect(lastFrame()).toContain("请至少用 Space"));
      expect(confirmed).not.toHaveBeenCalled();
      stdin.write(" ");
      await flush();
      stdin.write("\u001b[B");
      await flush();
      stdin.write(" ");
      await vi.waitFor(() => expect(lastFrame()).toContain("可能被同时读取"));
      stdin.write("\r");
      await flush();
      expect(confirmed).toHaveBeenCalledWith(["shared", "codex"]);
    } finally { unmount(); }
  });
});
