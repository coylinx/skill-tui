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
import { findInstallations, planRemoval, removeInstallations } from "./core/remove.js";
import { applyUpdatePlan, disposeUpdatePlans, planUpdates, updateSummary } from "./core/update.js";
import type { AgentId, InventoryItem } from "./types.js";

type Command = "list" | "doctor" | "remove" | "update";

interface ParsedArgs {
  flags: AppFlags;
  url?: string;
  command?: Command;
  json: boolean;
  agent?: AgentId;
  yes: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: AppFlags = { dryRun: false, overwrite: false, noBackup: false };
  let url: string | undefined;
  let command: Command | undefined;
  let json = false;
  let agent: AgentId | undefined;
  let yes = false;
  let force = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--overwrite") flags.overwrite = true;
    else if (arg === "--no-backup") flags.noBackup = true;
    else if (arg === "--json") json = true;
    else if (arg === "--yes" || arg === "-y") yes = true;
    else if (arg === "--force") force = true;
    else if (arg === "--agent") agent = argv[++i] as AgentId | undefined;
    else if ((arg === "list" || arg === "doctor" || arg === "remove" || arg === "update") && !command && !url) command = arg;
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
  return { flags, url, command, json, agent, yes, force };
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
  remove <name>  Preview removal of a managed Skill; use --yes to execute
  update [name]   Preview source changes; use --yes to apply, --force for local edits
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

function updateView(plan: Awaited<ReturnType<typeof planUpdates>>[number]) {
  return {
    status: plan.item.status,
    agent: plan.item.record.agent,
    installName: plan.item.record.installName,
    targetPath: plan.item.record.targetPath,
    currentHash: plan.item.currentHash ?? null,
    sourceCommit: plan.item.sourceCommit ?? null,
    changes: plan.item.changes.map((change) => ({ path: change.path, kind: change.kind })),
    message: plan.item.message ?? null,
  };
}

async function runCommand(command: Command, json: boolean, agent?: AgentId, target?: string, yes = false, force = false, dryRun = false): Promise<number> {
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

  if (command === "update") {
    const plans = await planUpdates(target, agent);
    try {
      if (!yes || dryRun) {
        if (json) console.log(JSON.stringify({ schemaVersion: 1, execute: false, summary: updateSummary(plans), items: plans.map(updateView) }, null, 2));
        else {
          const summary = updateSummary(plans);
          console.log(`更新预览：${summary.update} 个可更新，${summary.current} 个已是最新，${summary.modified} 个本地有改动，${summary.unavailable} 个来源不可用`);
          for (const plan of plans) {
            const changes = plan.item.changes.length ? ` (${plan.item.changes.map((change) => `${change.kind}:${change.path}`).join(", ")})` : "";
            console.log(`- ${plan.item.status.padEnd(11)} ${plan.item.record.agent}/${plan.item.record.installName}${changes}${plan.item.message ? ` — ${plan.item.message}` : ""}`);
          }
          console.log("确认执行请加 --yes；修改过的目标需要额外加 --force。");
        }
        return 0;
      }
      const results = applyUpdatePlan(plans, force);
      if (json) console.log(JSON.stringify({ schemaVersion: 1, execute: true, results }, null, 2));
      else for (const result of results) console.log(`${result.status}: ${displayPath(result.targetPath)}${result.message ? ` — ${result.message}` : ""}`);
      return results.some((result) => result.status === "failed") ? 1 : 0;
    } finally { disposeUpdatePlans(plans); }
  }

  if (command === "remove") {
    if (!target) {
      const message = "remove 需要 Skill 安装名、skillId 或来源相对路径。";
      if (json) console.log(JSON.stringify({ error: message }));
      else console.error(message);
      return 2;
    }
    const records = findInstallations(target, agent);
    const plan = planRemoval(records);
    if (json && !yes) {
      console.log(JSON.stringify({ schemaVersion: 1, query: target, execute: false, items: plan }, null, 2));
      return records.length > 0 ? 0 : 1;
    }
    if (!yes) {
      if (plan.length === 0) {
        console.log(`没有找到受 skilltui 管理的 Skill：${target}`);
        return 1;
      }
      console.log(`将删除 ${plan.length} 个安装目标（只读预览）：`);
      for (const item of plan) console.log(`- ${item.action.padEnd(7)} ${item.record.agent}/${item.record.installName} → ${displayPath(item.record.targetPath)}`);
      console.log("确认执行请加 --yes；默认不会修改磁盘。");
      return 0;
    }
    const results = removeInstallations(records);
    if (json) console.log(JSON.stringify({ schemaVersion: 1, query: target, execute: true, results }, null, 2));
    else for (const result of results) console.log(`${result.status}: ${displayPath(result.targetPath)}${result.message ? ` — ${result.message}` : ""}`);
    return results.some((result) => result.status === "failed") ? 1 : 0;
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
  const { flags, url, command, json, agent, yes, force } = parseArgs(process.argv.slice(2));

  if (command) {
    void runCommand(command, json, agent, url, yes, force, flags.dryRun).then((code) => { process.exitCode = code; }).catch((error) => {
      if (json) console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      else console.error(`skilltui ${command} 失败：`, error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
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
