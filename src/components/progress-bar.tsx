// Simple text progress bar: [████████░░░░░░] 60%

import { Text } from "ink";
import { theme } from "../theme.js";

export function ProgressBar({ value, total, width = 16 }: { value: number; total: number; width?: number }) {
  const ratio = total > 0 ? value / total : 1;
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const pct = Math.round(ratio * 100);
  return (
    <Text color={theme.accent}>
      [{bar}] {pct}%
    </Text>
  );
}
