// Visual theme tokens.  The palette is intentionally closer to a toolchain
// console than a generic terminal theme: cool graphite surfaces keep long
// paths readable while mint and amber separate actions from status.

export const theme = {
  background: "#0b1020", // main backdrop
  panel: "#121a2b", // input/box fill
  panelRaised: "#18243a", // focused row / raised surface
  text: "#e8eefc", // primary text
  textMuted: "#8493ad", // secondary text + logo left half
  textSubtle: "#52627d", // low-emphasis metadata
  accent: "#8bf2d2", // mint — selection and primary action
  accentDim: "#4cc7ae", // secondary mint
  accentWarm: "#ffb454", // amber — brand mark and caution
  success: "#7ee787", // green — done, checked
  warning: "#f2cc60", // amber — exists, configured-only
  danger: "#ff7b72", // red — error, missing
  border: "#2a3a55", // quiet borders
  borderStrong: "#3e5579", // focused/keycap borders
} as const;

export type Theme = typeof theme;
