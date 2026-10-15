import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    globals: false,
    setupFiles: ["tests/setup.ts"],
  },
  esbuild: {
    jsx: "automatic",
    loader: "tsx",
  },
});
