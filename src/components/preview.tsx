// Screen ⑤: import preview — the confirmation gate.
// Lists every (skill × agent) target with its planned action before any
// write happens. Enter confirms; `o` toggles overwrite mode (re-plans);
// Esc goes back. In --dry-run mode, Enter prints the plan and exits.

import { Box, Text, useApp, useInput } from "ink";
import { useMemo, useState } from "react";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";
import { plan } from "../core/importer.js";
import { displayPath } from "../core/agents.js";
import { theme } from "../theme.js";
import type { ImportTask, PlanItem } from "../types.js";

interface Props {
  tasks: ImportTask[];
  dryRun: boolean;
  noBackup: boolean;
  /** Initial overwrite mode (from the --overwrite flag); `o` still toggles. */
  initialOverwrite?: boolean;
  onDryRun?: (report: string) => void;
  onConfirm: (overwrite: boolean) => void;
  onBack: () => void;
}

const HINTS = (dryRun: boolean): Hint[] => [
  { key: "Enter", label: dryRun ? "打印计划并退出" : "确认导入" },
  { key: "o", label: "切换覆盖模式" },
  { key: "Esc", label: "返回" },
];

export function Preview({
  tasks,
  dryRun,
  noBackup,
  initialOverwrite = false,
  onDryRun,
  onConfirm,
  onBack,
}: Props) {
  const { exit } = useApp();
  const [overwrite, setOverwrite] = useState(initialOverwrite);

  const items: PlanItem[] = useMemo(
    () => plan(tasks, overwrite, noBackup),
    [tasks, overwrite, noBackup],
  );

  // group by agent for readable output
  const byAgent = useMemo(() => groupBy(items, (i) => i.agent), [items]);
  const freshCount = items.filter((i) => !i.exists).length;
  const overwriteCount = items.filter((i) => i.exists && i.action === "overwrite").length;
  const skipCount = items.filter((i) => i.exists && i.action === "skip").length;
  const writeCount = freshCount + overwriteCount;

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (key.return) {
      if (dryRun) {
        // Hand the report to the CLI entry point. It prints only after Ink
        // exits the alternate screen, so the text remains visible.
        onDryRun?.(formatDryRunPlan(items, overwrite));
        exit();
      } else {
        onConfirm(overwrite);
      }
    } else if (input.toLowerCase() === "o") {
      setOverwrite((v) => !v);
    }
  });

  return (
    <ScreenFrame>
      <Title stage={6} />

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
        minWidth={64}
      >
        <Box marginBottom={1}>
          <Text color={theme.accent} bold>
            导入预览 — 确认后将写入以下路径
            {dryRun ? "（dry-run，不会写入）" : ""}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color={theme.text}>
            将安装 {writeCount} 项
            {overwriteCount > 0 ? (
              <Text color={theme.warning}> · 覆盖 {overwriteCount} 项</Text>
            ) : null}
            {skipCount > 0 ? (
              <Text dimColor> · 跳过 {skipCount} 项</Text>
            ) : null}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color={theme.textMuted}>
            {Object.keys(byAgent).length} 个 Agent · {items.length} 个目标路径 · 写入前可回退
          </Text>
        </Box>

        {Object.entries(byAgent).map(([agent, list]) => (
          <Box key={agent} flexDirection="column" marginBottom={1}>
            <Text color={theme.accentDim} bold>
              {agent}
            </Text>
            {list.map((item) => (
              <Box key={`${item.agent}-${item.skill.id}`} flexDirection="row">
                <Text color={item.exists ? theme.warning : theme.success}>
                  {item.exists ? (item.action === "overwrite" ? "↻" : "◷") : "+"}
                </Text>
                <Text color={theme.text}>
                  {" "}
                  {(item.skill.installName ?? item.skill.name).padEnd(20)}
                </Text>
                <Text dimColor color={theme.textMuted}>
                  → {displayPath(item.targetPath)}
                </Text>
                {item.exists && item.action === "overwrite" ? (
                  <Text color={theme.warning}> [覆盖{noBackup ? "" : "+备份"}]</Text>
                ) : null}
                {item.exists && item.action === "skip" ? (
                  <Text dimColor> [跳过]</Text>
                ) : null}
              </Box>
            ))}
          </Box>
        ))}

        <Box marginTop={1}>
          <Text dimColor>
            已存在处理：{overwrite ? (noBackup ? "覆盖（无备份）" : "覆盖+备份") : "跳过（默认）"} — 按 o 切换
          </Text>
        </Box>
      </Box>

      <FooterHint hints={HINTS(dryRun)} />
    </ScreenFrame>
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

export function formatDryRunPlan(items: PlanItem[], overwrite: boolean): string {
  const lines = [
    "[dry-run] 导入计划（不会写入磁盘）：",
    `覆盖模式: ${overwrite ? "是" : "否"}`,
    "",
  ];
  for (const item of items) {
    const tag = item.exists
      ? item.action === "overwrite"
        ? "OVERWRITE"
        : "SKIP"
      : "INSTALL";
    const name = item.skill.installName ?? item.skill.name;
    lines.push(`  ${tag.padEnd(9)} ${item.agent}/${name} → ${item.targetPath}`);
  }
  return lines.join("\n") + "\n";
}
