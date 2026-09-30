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
import { App, type AppFlags } from "./app.js";
import { pruneCache } from "./core/cache.js";
import { displayPath } from "./core/agents.js";
import { doctor } from "./core/doctor.js";
import { inventory } from "./core/inventory.js";
import type { AgentId, InventoryItem } from "./types.js";

type Command = "list" | "doctor";

interface ParsedArgs {
  flags: AppFlags;
  url?: string;
  command?: Command;
  json: boolean;
  agent?: AgentId;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: AppFlags = { dryRun: false, overwrite: false, noBackup: false };
  let url: string | undefined;
  let command: Command | undefined;
  let json = false;
  let agent: AgentId | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--overwrite") flags.overwrite = true;
    else if (arg === "--no-backup") flags.noBackup = true;
    else if (arg === "--json") json = true;
    else if (arg === "--agent") agent = argv[++i] as AgentId | undefined;
    else if ((arg === "list" || arg === "doctor") && !command && !url) command = arg;
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
  return { flags, url, command, json, agent };
}

function printHelp(): void {
  console.log(`skilltui — Skill installer TUI

Install Skills (SKILL.md) into AI coding agents from any git repo.
Supports: Claude Code, Codex, Cursor, ZCode, OpenClaw, Hermes, OpenCode.

Usage:
  skilltui [git-url] [options]

Options:
  --dry-run      Preview what would be written, then exit (no changes)
  --overwrite    Overwrite existing skills (backs up first by default)
  --no-backup    Skip backup on overwrite (requires confirm in preview)
  list           List installed and unmanaged Skills (use --json for scripts)
  doctor         Check manifest and installed Skill health (use --json)
  --agent <id>   Limit list to one Agent
  --json         Emit machine-readable output for list/doctor
  -h, --help     Show this help
  -v, --version  Show version

Examples:
  skilltui
  skilltui https://github.com/obra/superpowers.git
  skilltui --dry-run https://github.com/obra/superpowers.git
`);
}

function listView(item: InventoryItem) {
  return {
    status: item.status,
    agent: item.agent,
    installName: item.installName,
    targetPath: item.targetPath,
    source: item.record?.source ?? null,
    installedAt: item.record?.installedAt ?? null,
    updatedAt: item.record?.updatedAt ?? null,
    issue: item.issue ?? null,
  };
}

function runCommand(command: Command, json: boolean, agent?: AgentId): number {
  if (command === "list") {
    const items = inventory().filter((item) => !agent || item.agent === agent);
    if (json) {
      console.log(JSON.stringify({ schemaVersion: 1, items: items.map(listView) }, null, 2));
      return 0;
    }
    if (items.length === 0) {
      console.log("没有发现已记录或未管理的 Skill。");
      return 0;
    }
    console.log("STATUS     AGENT      SKILL                         TARGET");
    console.log("─".repeat(86));
    for (const item of items) {
      const status = item.status.padEnd(10);
      const name = item.installName.length > 28 ? `${item.installName.slice(0, 27)}…` : item.installName;
      console.log(`${status} ${item.agent.padEnd(10)} ${name.padEnd(29)} ${displayPath(item.targetPath)}`);
    }
    return 0;
  }

  const report = doctor();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(`doctor: clean (${report.checked} 个 Skill 已检查)`);
  } else {
    console.log(`doctor: ${report.issues.length} 个问题，已检查 ${report.checked} 个 Skill`);
    for (const issue of report.issues) {
      const pathText = issue.path ? ` — ${displayPath(issue.path)}` : "";
      console.log(`[${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}${pathText}`);
    }
  }
  return report.ok ? 0 : 1;
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

function main(): void {
  const { flags, url, command, json, agent } = parseArgs(process.argv.slice(2));

  if (command) {
    try {
      process.exitCode = runCommand(command, json, agent);
    } catch (error) {
      if (json) console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      else console.error(`skilltui ${command} 失败：`, error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    return;
  }

  // Prune cached repos older than 2 hours before entering the TUI, so disk
  // usage from ~/.skill-tui/cache/ stays bounded. Best-effort, non-fatal.
  try {
    pruneCache();
  } catch {
    // ignore — pruning must never block the app
  }

  // Enter the alternate screen buffer so the TUI starts on a clean screen
  // (previous terminal content is hidden) and restored when we exit —
  // like vim/htop. Supported by Windows Terminal, mintty (Git Bash), etc.
  const stdout = process.stdout;
  stdout.write("\x1b[?1049h\x1b[2J\x1b[3J\x1b[H");

  let dryRunReport = "";
  const instance = render(
    <App
      initialUrl={url}
      flags={flags}
      onDryRun={(report) => {
        dryRunReport = report;
      }}
    />,
    {
      exitOnCtrlC: false,
    },
  );

  let altScreenActive = true;
  const leaveAltScreen = (): void => {
    if (!altScreenActive) return;
    altScreenActive = false;
    stdout.write("\x1b[?1049l");
  };
  // Restore the screen on any exit path.
  process.on("exit", leaveAltScreen);
  process.on("SIGINT", () => {
    instance.unmount();
    leaveAltScreen();
    process.exit(0);
  });

  // Guard against unhandled rejections killing the process ugly.
  const onFatal = (err: unknown): void => {
    instance.unmount();
    leaveAltScreen();
    console.error(
      "\nskilltui 遇到错误：",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  };
  process.on("unhandledRejection", onFatal);
  process.on("uncaughtException", onFatal);

  // Normal Ink exits (q, Ctrl+C handled in the app, or dry-run confirmation)
  // do not terminate the process explicitly. Restore the original terminal
  // first, then print the dry-run report into the persistent buffer.
  void instance
    .waitUntilExit()
    .then(() => {
      leaveAltScreen();
      if (dryRunReport) stdout.write(`\n${dryRunReport}`);
    })
    .catch(onFatal);
}

main();
