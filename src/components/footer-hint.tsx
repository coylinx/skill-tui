// Bottom hint bar: shows keybindings as dim, right-aligned chips.
// Kept consistent across screens; callers pass the current hint set.

import { Box, Text } from "ink";
import { theme } from "../theme.js";

export interface Hint {
  key: string;
  label: string;
}

export function FooterHint({ hints }: { hints: Hint[] }) {
  return (
    <Box marginTop={1} justifyContent="center">
      {hints.map((h, i) => (
        <Box key={h.key} flexDirection="row">
          {i > 0 && (
            <Text dimColor color={theme.textMuted}>
              {"   "}
            </Text>
          )}
          <Text color={theme.accent} bold>
            {h.key}
          </Text>
          <Text dimColor color={theme.textMuted}>
            {" "}
            {h.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
