// Screen ⑦: result summary with r/o/b/q actions.
// r = re-import (back to URL input), o = open an install dir, b = restore a
// backup, q = quit.

import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";
import { recentBackups, restoreBackup, type BackupRecord } from "../core/backup.js";
import { displayPath } from "../core/agents.js";
import { theme } from "../theme.js";
import type { ImportSummary } from "../types.js";

interface Props {
  summary: ImportSummary;
  onRestart: () => void;
}

const HINTS: Hint[] = [
  { key: "r/Esc", label: "回首页" },
  { key: "o", label: "打开安装目录" },
  { key: "b", label: "恢复备份" },
  { key: "q", label: "退出" },
];

export function Result({ summary, onRestart }: Props) {
  const { exit } = useApp();
  const [backups, setBackups] = useState<BackupRecord[] | null>(null);
  const [notice, setNotice] = useState<string>("");

  const { results } = summary;
  const done = results.filter((r) => r.status === "done").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const backed = results.filter((r) => r.backupPath).length;

  // group results by agent for the summary
  const byAgent = groupBy(results, (r) => extractAgent(r.targetPath));

  useInput((input, key) => {
    const ch = input.toLowerCase();
    if (backups) {
      // restore sub-mode: number keys restore, Esc returns
      if (key.escape) {
        setBackups(null);
        return;
      }
      const n = parseInt(input, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= backups.length) {
        try {
          restoreBackup(backups[n - 1]);
          setNotice(`已恢复：${backups[n - 1].skillName} → ${displayPath(backups[n - 1].originalPath)}`);
        } catch (e) {
          setNotice(`恢复失败：${e instanceof Error ? e.message : String(e)}`);
        }
        setBackups(null);
      }
      return;
    }
    if (ch === "r" || key.escape) {
      onRestart();
    } else if (ch === "q") {
      exit();
    } else if (ch === "o") {
      // open the first done result's parent (agent skills dir)
      const first = results.find((r) => r.status === "done");
      if (first) openPath(parentDir(first.targetPath));
      setNotice("已尝试打开安装目录");
    } else if (ch === "b") {
      setBackups(recentBackups(9));
    }
  });

  return (
    <ScreenFrame>
      <Title />

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
        minWidth={60}
      >
        <Box marginBottom={1}>
          <Text color={failed > 0 ? theme.warning : theme.success} bold>
            导入完成
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color={theme.text}>
            ✓ {done} 项成功
          </Text>
          {skipped > 0 ? <Text color={theme.warning}> · ◷ {skipped} 项跳过</Text> : null}
          {failed > 0 ? <Text color={theme.danger}> · ✗ {failed} 项失败</Text> : null}
          {backed > 0 ? <Text dimColor> · ↻ {backed} 项已备份</Text> : null}
        </Box>

        {backups ? (
          <BackupRestoreList records={backups} />
        ) : (
          Object.entries(byAgent).map(([agent, list]) => (
            <Box key={agent} flexDirection="column" marginBottom={1}>
              <Text color={theme.accentDim} bold>
                {agent}
              </Text>
              {list.map((r, i) => (
                <Box key={i} flexDirection="row">
                  <Text
                    color={
                      r.status === "done"
                        ? theme.success
                        : r.status === "failed"
                          ? theme.danger
                          : theme.warning
                    }
                  >
                    {r.status === "done" ? "✓" : r.status === "failed" ? "✗" : "◷"}
                  </Text>
                  <Text dimColor color={theme.textMuted}>
                    {" "}
                    {displayPath(r.targetPath)}
                    {r.message ? ` — ${r.message}` : ""}
                  </Text>
                </Box>
              ))}
            </Box>
          ))
        )}

        {notice ? (
          <Box marginTop={1}>
            <Text color={theme.accent}>{notice}</Text>
          </Box>
        ) : null}
      </Box>

      {backups ? (
        <Box marginTop={1}>
          <Text dimColor>输入序号恢复 · Esc 返回</Text>
        </Box>
      ) : (
        <FooterHint hints={HINTS} />
      )}
    </ScreenFrame>
  );
}

function BackupRestoreList({ records }: { records: BackupRecord[] }) {
  if (records.length === 0) {
    return <Text color="gray">没有可恢复的备份</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        选择要恢复的备份：
      </Text>
      {records.map((r, i) => (
        <Box key={r.id} flexDirection="row">
          <Text color={theme.accent} bold>
            {i + 1}.
          </Text>
          <Text dimColor color={theme.textMuted}>
            {" "}
            {r.skillName} ({r.agent}) → {displayPath(r.originalPath)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

// Extract the agent name from a target path like .../<agent>/skills/<name>.
function extractAgent(targetPath: string): string {
  const parts = targetPath.replace(/\\/g, "/").split("/");
  const idx = parts.lastIndexOf("skills");
  return idx > 0 ? parts[idx - 1] : parts[parts.length - 2] ?? "?";
}

function parentDir(p: string): string {
  return p.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || p;
}

function openPath(p: string): void {
  // best-effort cross-platform open
  const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
  void import("node:child_process").then(({ spawn }) => {
    const child = spawn(cmd, [p], { detached: true, stdio: "ignore" });
    child.on("error", () => {}); // e.g. xdg-open is absent on a minimal Linux install
    child.unref();
  });
}
