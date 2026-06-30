// Full-screen vertical+horizontal centering wrapper.
// Ink's justifyContent="center" only centers within the box's own height;
// to truly center on the terminal we must set the box height to the terminal
// row count (via useWindowSize) and let the inner content sit in the middle.

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
      height={rows}
      paddingX={2}
    >
      {children}
    </Box>
  );
}
