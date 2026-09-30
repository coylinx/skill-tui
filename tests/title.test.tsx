// Verify the Title renders without crashing and contains "SKILL".
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Title } from "../src/components/title.js";

describe("Title (Phase 0 smoke test)", () => {
  it("renders the logo art and subtitle", () => {
    const { lastFrame, unmount } = render(<Title />);
    const frame = lastFrame() ?? "";
    unmount();
    // figlet ANSI Shadow produces block chars; the letters spell SKILL TUI.
    // We assert on stable substrings rather than exact whitespace.
    expect(frame).toMatch(/Skill installer for/);
    // block-art contains the full-block glyph used by ANSI Shadow.
    expect(frame).toMatch(/█/);
  });
});
