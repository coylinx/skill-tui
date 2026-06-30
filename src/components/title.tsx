// Title block: centered dual-tone logo + a dim subtitle line.
// Mirrors the opencode home layout (logo on top, content below).

import { Box, Text } from "ink";
import { Logo } from "./logo.js";

const SUBTITLE =
  "Skill installer for Claude Code · Codex · Cursor · ZCode · Gemini · OpenCode";

export function Title() {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      <Logo />
      <Text color="gray" dimColor>
        {SUBTITLE}
      </Text>
    </Box>
  );
}
