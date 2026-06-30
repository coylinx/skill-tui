// Visual theme tokens — opencode-inspired dark palette.
// Used by every component for consistent colors.

export const theme = {
  background: "#0d1117", // main backdrop
  panel: "#161b22", // input/box fill
  text: "#e6edf3", // primary text
  textMuted: "#7d8590", // secondary text + logo left half
  accent: "#2f81f7", // blue — logo right half, selection, emphasis
  accentDim: "#1f6feb", // secondary emphasis
  success: "#3fb950", // green — done, checked
  warning: "#d29922", // amber — exists, configured-only
  danger: "#f85149", // red — error, missing
  border: "#30363d", // box borders
} as const;

export type Theme = typeof theme;
