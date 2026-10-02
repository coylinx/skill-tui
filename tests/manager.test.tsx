import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";

vi.mock("../src/core/inventory.js", () => ({ inventory: () => [] }));
const mocks = vi.hoisted(() => ({
  planUpdates: vi.fn(),
  applyUpdatePlan: vi.fn(),
  disposeUpdatePlans: vi.fn(),
}));
vi.mock("../src/core/update.js", () => ({ ...mocks }));

import { Manager } from "../src/components/manager.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  mocks.planUpdates.mockResolvedValue([]);
  mocks.applyUpdatePlan.mockReturnValue([]);
  mocks.disposeUpdatePlans.mockReset();
});

describe("Manager", () => {
  it("renders an empty management dashboard and can scan sources", async () => {
    const { stdin, lastFrame, unmount } = render(<Manager onBack={() => {}} />);
    expect(lastFrame() ?? "").toContain("Skill 管理台");
    expect(lastFrame() ?? "").toContain("还没有可管理的 Skill");
    stdin.write("u");
    await flush();
    expect(lastFrame() ?? "").toContain("扫描完成：没有可直接更新的目标");
    stdin.write("b");
    await flush();
    expect(lastFrame() ?? "").toContain("没有可恢复的备份");
    unmount();
  });

  it("selects an update, shows confirmation, and executes it", async () => {
    const record = {
      id: "record-1",
      skillId: "sample",
      installName: "sample",
      agent: "codex",
      targetPath: "C:/codex/skills/sample",
      source: { kind: "local", location: "C:/source/sample", relativePath: ".", commit: null },
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contentHash: "a".repeat(64),
      files: [],
    } as const;
    mocks.planUpdates.mockResolvedValueOnce([{
      item: { record, status: "update", changes: [{ path: "SKILL.md", kind: "modified" }] },
      source: { skill: { id: "sample", name: "sample", installName: "sample", dir: "C:/source/sample", description: "sample", relativePath: "." }, cleanup: () => {}, commit: null, root: "C:/source" },
    }]);
    mocks.applyUpdatePlan.mockReturnValue([{ status: "done", targetPath: record.targetPath, action: "overwrite" }]);
    const { stdin, lastFrame, unmount } = render(<Manager onBack={() => {}} />);
    stdin.write("u");
    await flush();
    expect(lastFrame() ?? "").toContain("选择要更新的目标");
    stdin.write("\r");
    await flush();
    expect(lastFrame() ?? "").toContain("更新预览");
    stdin.write("\r");
    await flush();
    expect(mocks.applyUpdatePlan).toHaveBeenCalledTimes(1);
    expect(lastFrame() ?? "").toContain("更新完成：1 成功");
    unmount();
  });
});
