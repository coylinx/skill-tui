// Bottom hint bar: small keycaps make the interaction model scannable without
// turning the footer into another noisy panel.

import { Box, Text } from "ink";
import { theme } from "../theme.js";

export interface Hint {
  key: string;
  label: string;
}

export function FooterHint({ hints }: { hints: Hint[] }) {
  return (
    <Box marginTop={1} justifyContent="center" flexWrap="wrap">
      {hints.map((h, i) => (
        <Box key={h.key} flexDirection="row">
          {i > 0 && (
            <Text dimColor color={theme.textMuted}>
              {"  "}
            </Text>
          )}
          <Box borderStyle="round" borderColor={theme.borderStrong} paddingX={1}>
            <Text color={theme.accent} bold>{h.key}</Text>
          </Box>
          <Text dimColor color={theme.textMuted}> {h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
