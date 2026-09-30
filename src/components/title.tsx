// Title block: centered dual-tone logo + a dim subtitle line.
// Mirrors the opencode home layout (logo on top, content below).

import { Box, Text } from "ink";
import { Logo } from "./logo.js";
import { theme } from "../theme.js";

const SUBTITLE =
  "Skill installer for Claude Code · Codex · Cursor · ZCode · OpenClaw · Hermes · OpenCode";

// Short labels keep the rail readable in a normal 80-column terminal.
const STAGES = ["URL", "FETCH", "SKILLS", "NAME", "AGENT", "REVIEW", "IMPORT", "DONE"];

export function Title({ stage, compact = false }: { stage?: number; compact?: boolean }) {
  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      {compact ? (
        <Box flexDirection="row">
          <Text color={theme.accentWarm} bold>◆</Text>
          <Text color={theme.textMuted}> SKILL/TUI </Text>
          <Text color={theme.accent} bold>INSTALLER</Text>
        </Box>
      ) : (
        <>
          <Logo />
          <Text color="gray" dimColor>{SUBTITLE}</Text>
        </>
      )}
      {stage ? (
        <Box flexDirection="row" marginTop={1}>
          <Text color={theme.accent} bold>STEP {stage}/8</Text>
          <Text color={theme.text}>  {STAGES[stage - 1]}</Text>
          <Text color={theme.textSubtle}>  ·  </Text>
          {STAGES.map((label, index) => (
            <Text key={label} color={index + 1 <= stage ? theme.accentDim : theme.textSubtle}>
              {index + 1 <= stage ? "●" : "○"}{index < STAGES.length - 1 ? " " : ""}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
