// Cross-platform executable detection on PATH.
// Returns true if `name` resolves to an executable (which/where on Windows).

import { spawn } from "node:child_process";

/** True if an executable named `exe` is found on PATH. */
export function exeOnPath(exe: string): Promise<boolean> {
  // On Windows use `where`, elsewhere `which`.
  const cmd = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    const child = spawn(cmd, [exe], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
