// ASCII block-art title for "SKILL TUI", rendered in the ANSI Shadow style.
// The art is pre-generated (via figlet, at build time) and embedded as a
// constant so the bundled CLI has no runtime font-file dependency.
//
// Two independent horizontal gradients, pure linear by column index:
//   "SKILL" (cols 0-29):   dark gray → white (灰白渐变, 从左到右慢慢变浅)
//   "TUI"   (cols 39-59):  dark brown → bright amber (棕黄渐变)

import { Box, Text } from "ink";
import { memo } from "react";

// figlet.textSync("SKILL TUI", { font: "ANSI Shadow" })
const ART =
  "███████╗██╗  ██╗██╗██╗     ██╗         ████████╗██╗   ██╗██╗\n" +
  "██╔════╝██║ ██╔╝██║██║     ██║         ╚══██╔══╝██║   ██║██║\n" +
  "███████╗█████╔╝ ██║██║     ██║            ██║   ██║   ██║██║\n" +
  "╚════██║██╔═██╗ ██║██║     ██║            ██║   ██║   ██║██║\n" +
  "███████║██║  ██╗██║███████╗███████╗       ██║   ╚██████╔╝██║\n" +
  "╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝       ╚═╝    ╚═════╝ ╚═╝\n" +
  "                                                            ";

const SKILL_END = 29;
const TUI_START = 39;
const WIDTH = 60;

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}
function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}
function grad(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): string {
  return `#${toHex(lerp(from[0], to[0], t))}${toHex(lerp(from[1], to[1], t))}${toHex(lerp(from[2], to[2], t))}`;
}

// SKILL gradient endpoints
const SKILL_FROM: [number, number, number] = [50, 50, 58]; // #32323a dark gray
const SKILL_TO: [number, number, number] = [235, 235, 240]; // #ebebf0 near white

// TUI gradient endpoints
const TUI_FROM: [number, number, number] = [74, 53, 32]; // #4a3520 dark brown
const TUI_TO: [number, number, number] = [245, 166, 35]; // #f5a623 bright amber

function colorFor(col: number): string {
  if (col <= SKILL_END) {
    return grad(SKILL_FROM, SKILL_TO, col / SKILL_END);
  }
  if (col >= TUI_START) {
    return grad(TUI_FROM, TUI_TO, (col - TUI_START) / (WIDTH - 1 - TUI_START));
  }
  // gap between SKILL and TUI: blend from SKILL_TO → TUI_FROM
  return grad(SKILL_TO, TUI_FROM, (col - SKILL_END) / (TUI_START - SKILL_END));
}

export const Logo = memo(function Logo() {
  const lines = ART.split("\n").filter((l) => l.length > 0);
  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, row) => (
        <Box key={row} flexDirection="row">
          {line.split("").map((ch, col) => (
            <Text key={col} color={colorFor(col)} bold>
              {ch}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
});
