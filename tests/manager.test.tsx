import { describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";

vi.mock("../src/core/inventory.js", () => ({ inventory: () => [] }));

import { Manager } from "../src/components/manager.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("Manager", () => {
  it("renders an empty management dashboard and can scan sources", async () => {
    const { stdin, lastFrame, unmount } = render(<Manager onBack={() => {}} />);
    expect(lastFrame() ?? "").toContain("Skill 管理台");
    expect(lastFrame() ?? "").toContain("还没有可管理的 Skill");
    stdin.write("u");
    await flush();
    expect(lastFrame() ?? "").toContain("扫描完成：0 个可更新");
    unmount();
  });
});
