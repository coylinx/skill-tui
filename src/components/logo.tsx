// ASCII block-art title for "SKILL TUI", rendered in the ANSI Shadow style.
// The art is pre-generated (via figlet, at build time) and embedded as a
// constant so the bundled CLI has no runtime font-file dependency.
//
// Split into left/right halves for the dual-tone opencode-style look:
// left half = theme.textMuted, right half = theme.accent + bold.

import { Box, Text } from "ink";
import { memo } from "react";
import { theme } from "../theme.js";

// figlet.textSync("SKILL TUI", { font: "ANSI Shadow" })
const ART =
  "███████╗██╗  ██╗██╗██╗     ██╗         ████████╗██╗   ██╗██╗\n" +
  "██╔════╝██║ ██╔╝██║██║     ██║         ╚══██╔══╝██║   ██║██║\n" +
  "███████╗█████╔╝ ██║██║     ██║            ██║   ██║   ██║██║\n" +
  "╚════██║██╔═██╗ ██║██║     ██║            ██║   ██║   ██║██║\n" +
  "███████║██║  ██╗██║███████╗███████╗       ██║   ╚██████╔╝██║\n" +
  "╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝       ╚═╝    ╚═════╝ ╚═╝\n" +
  "                                                            ";

// Split column: "SKILL" ends around col 28, "TUI" starts ~41. 38 sits in the
// gap so the left half is the brand word, the right half is the product type.
const SPLIT_COL = 38;

function buildLogo(): { left: string[]; right: string[] } {
  const lines = ART.split("\n").filter((l) => l.length > 0);
  const width = Math.max(...lines.map((l) => l.length));
  const left: string[] = [];
  const right: string[] = [];
  for (const line of lines) {
    const padded = line.padEnd(width, " ");
    left.push(padded.slice(0, SPLIT_COL));
    right.push(padded.slice(SPLIT_COL));
  }
  return { left, right };
}

export const Logo = memo(function Logo() {
  const { left, right } = buildLogo();
  return (
    <Box flexDirection="column" alignItems="center">
      <Box flexDirection="row">
        <Box flexDirection="column">
          {left.map((line, i) => (
            <Text key={i} color={theme.textMuted}>
              {line}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          {right.map((line, i) => (
            <Text key={i} color={theme.accent} bold>
              {line}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
});
