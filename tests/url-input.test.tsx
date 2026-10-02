// Verify the UrlInput screen renders and Enter submits the URL.
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { UrlInput } from "../src/components/url-input.js";

// ink-testing-library flushes input asynchronously; give handlers a tick.
const flush = () => new Promise((r) => setTimeout(r, 30));

describe("UrlInput", () => {
  it("renders the prompt and placeholder", () => {
    const { lastFrame } = render(<UrlInput history={[]} onSubmit={() => {}} />);
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/输入 Skill 仓库的 Git 地址/);
    expect(frame).toMatch(/Enter/);
  });

  it("submits the typed URL on Enter", async () => {
    let submitted = "";
    const { stdin, unmount } = render(
      <UrlInput
        history={[]}
        onSubmit={(url) => {
          submitted = url;
        }}
      />,
    );
    stdin.write("https://github.com/x/skills.git");
    await flush();
    stdin.write("\r");
    await flush();
    unmount();
    expect(submitted).toBe("https://github.com/x/skills.git");
  });

  it("prefills initialValue without auto-submitting on mount", async () => {
    let submitted = "";
    const { lastFrame, unmount } = render(
      <UrlInput
        initialValue="https://github.com/x/prefilled.git"
        history={[]}
        onSubmit={(url) => {
          submitted = url;
        }}
      />,
    );
    await flush();
    expect(lastFrame() ?? "").toContain("https://github.com/x/prefilled.git");
    expect(submitted).toBe("");
    unmount();
  });

  it("recalls history with the up arrow", async () => {
    let submitted = "";
    const { stdin, unmount } = render(
      <UrlInput
        history={["https://github.com/old/repo.git"]}
        onSubmit={(url) => {
          submitted = url;
        }}
      />,
    );
    stdin.write("\u001b[A"); // up arrow
    await flush();
    stdin.write("\r"); // enter
    await flush();
    unmount();
    expect(submitted).toBe("https://github.com/old/repo.git");
  });

  it("opens the management dashboard from an empty home input", async () => {
    let opened = false;
    const { stdin, unmount } = render(
      <UrlInput history={[]} onSubmit={() => {}} onManage={() => { opened = true; }} />,
    );
    stdin.write("m");
    await flush();
    unmount();
    expect(opened).toBe(true);
  });
});
