// CLI entry point. Published as the `skilltui` command (npm package `skill-tui`).
// Usage:
//   skilltui                    → interactive flow
//   skilltui <git-url>          → skip URL input, go straight to clone
//   skilltui --dry-run [url]    → stop at the preview screen, no writes
//   skilltui --overwrite [url]  → overwrite existing skills (with backup)
//   skilltui --no-backup [url]  → skip backup on overwrite (needs confirm)

import { render } from "ink";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs as parseNodeArgs } from "node:util";
import { App, type AppFlags } from "./app.js";
import { pruneCache } from "./core/cache.js";

interface ParsedArgs {
  flags: AppFlags;
  url?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = parseNodeArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      overwrite: { type: "boolean" },
      "no-backup": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (positionals.length > 1) throw new Error("一次只能指定一个仓库地址。使用 --help 查看用法。");
  return {
    flags: { dryRun: !!values["dry-run"], overwrite: !!values.overwrite, noBackup: !!values["no-backup"] },
    url: positionals[0],
    help: !!values.help,
    version: !!values.version,
  };
}

function printHelp(): void {
  console.log(`skilltui — Skill installer TUI

Install Skills (SKILL.md) into AI coding agents from any git repo.
Supports: Claude Code, Codex, Cursor, ZCode, OpenClaw, Hermes, OpenCode.

Usage:
  skilltui [git-url] [options]

Options:
  --dry-run      Preview and exit without installing or overwriting skills
  --overwrite    Overwrite existing skills (backs up first by default)
  --no-backup    Skip backup on overwrite (requires confirm in preview)
  -h, --help     Show this help
  -v, --version  Show version

Examples:
  skilltui
  skilltui https://github.com/obra/superpowers.git
  skilltui --dry-run https://github.com/obra/superpowers.git
`);
}

function printVersion(): void {
  try {
    // dist/index.js → ../package.json (project root)
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    console.log(`skilltui ${pkg.version}`);
  } catch {
    console.log("skilltui (version unknown)");
  }
}

async function main(): Promise<void> {
  const { flags, url, help, version } = parseArgs(process.argv.slice(2));
  if (help) return printHelp();
  if (version) return printVersion();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("交互模式需要终端（TTY）。请在终端中运行 skilltui，或使用 --help 查看用法。");
  }

  // Prune cached repos older than 2 hours before entering the TUI, so disk
  // usage from ~/.skill-tui/cache/ stays bounded. Best-effort, non-fatal.
  try {
    pruneCache();
  } catch {
    // ignore — pruning must never block the app
  }

  // Ink owns raw mode, Ctrl+C handling, and alternate-screen restoration.
  const instance = render(<App initialUrl={url} flags={flags} />, {
    alternateScreen: true,
    exitOnCtrlC: true,
  });
  const onSigint = () => {
    process.exitCode = 130;
    instance.unmount();
  };
  const onSigterm = () => {
    process.exitCode = 143;
    instance.unmount();
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  try {
    const output = await instance.waitUntilExit();
    if (typeof output === "string") process.stdout.write(output);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

void main().catch((error: unknown) => {
  console.error("skilltui：", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
