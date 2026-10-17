// Full-screen vertical+horizontal centering wrapper.
// Ink's justifyContent="center" only centers within the box's own height;
// Use a minimum height so a long preview can grow beyond the terminal instead
// of being vertically centered outside the visible drawing region.

import { Box, useStdout } from "ink";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function ScreenFrame({ children }: Props) {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight={rows}
      paddingX={2}
    >
      {children}
    </Box>
  );
}
