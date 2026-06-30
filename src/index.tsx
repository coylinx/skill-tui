// CLI entry point. Published as the `skill` command (npm package `skill-tui`).
// Usage:
//   skill                    → interactive flow
//   skill <git-url>          → skip URL input, go straight to clone
//   skill --dry-run [url]    → stop at the preview screen, no writes
//   skill --overwrite [url]  → overwrite existing skills (with backup)
//   skill --no-backup [url]  → skip backup on overwrite (needs confirm)

import { render } from "ink";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { App, type AppFlags } from "./app.js";

interface ParsedArgs {
  flags: AppFlags;
  url?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: AppFlags = { dryRun: false, overwrite: false, noBackup: false };
  let url: string | undefined;
  for (const arg of argv) {
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--overwrite") flags.overwrite = true;
    else if (arg === "--no-backup") flags.noBackup = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      printVersion();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      url = arg;
    }
  }
  return { flags, url };
}

function printHelp(): void {
  console.log(`skill — Skill installer TUI

Install Skills (SKILL.md) into AI coding agents from any git repo.
Supports: Claude Code, Codex, Cursor, ZCode, Gemini CLI, OpenCode.

Usage:
  skill [git-url] [options]

Options:
  --dry-run      Preview what would be written, then exit (no changes)
  --overwrite    Overwrite existing skills (backs up first by default)
  --no-backup    Skip backup on overwrite (requires confirm in preview)
  -h, --help     Show this help
  -v, --version  Show version

Examples:
  skill
  skill https://github.com/obra/superpowers.git
  skill --dry-run https://github.com/obra/superpowers.git
`);
}

function printVersion(): void {
  try {
    // dist/index.js → ../package.json (project root)
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    console.log(`skill ${pkg.version}`);
  } catch {
    console.log("skill (version unknown)");
  }
}

function main(): void {
  const { flags, url } = parseArgs(process.argv.slice(2));

  // Clean exit on Ctrl+C / SIGINT — Ink normally handles this, but ensure
  // we don't leave the terminal in a weird state if something throws.
  const instance = render(<App initialUrl={url} flags={flags} />);

  // Guard against unhandled rejections killing the process ugly.
  const onFatal = (err: unknown) => {
    instance.unmount();
    console.error(
      "\nskill 遇到错误：",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  };
  process.on("unhandledRejection", onFatal);
  process.on("uncaughtException", onFatal);
}

main();
