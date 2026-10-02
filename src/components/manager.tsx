// Read-only management dashboard. It keeps the import flow focused while
// giving returning users a compact view of installed and unhealthy Skills.
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { displayPath } from "../core/agents.js";
import { inventory } from "../core/inventory.js";
import { disposeUpdatePlans, planUpdates } from "../core/update.js";
import type { InventoryItem, UpdateStatus } from "../types.js";
import { theme } from "../theme.js";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";

const HINTS: Hint[] = [
  { key: "u", label: "扫描更新" },
  { key: "r", label: "刷新" },
  { key: "Esc", label: "返回" },
];

type RowStatus = InventoryItem["status"] | UpdateStatus;

const statusLabel: Record<RowStatus, { icon: string; label: string; color: string }> = {
  managed: { icon: "●", label: "已管理", color: theme.success },
  update: { icon: "↑", label: "可更新", color: theme.accent },
  current: { icon: "●", label: "已最新", color: theme.success },
  modified: { icon: "!", label: "本地改动", color: theme.warning },
  missing: { icon: "×", label: "目标缺失", color: theme.danger },
  invalid: { icon: "!", label: "格式异常", color: theme.danger },
  unavailable: { icon: "?", label: "来源不可用", color: theme.warning },
  unmanaged: { icon: "○", label: "未接管", color: theme.textMuted },
};

function statusFor(item: InventoryItem, updates: Record<string, UpdateStatus>): RowStatus {
  return item.record ? updates[item.record.id] ?? item.status : item.status;
}

export function Manager({ onBack }: { onBack: () => void }) {
  const { exit } = useApp();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [updates, setUpdates] = useState<Record<string, UpdateStatus>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("按 u 扫描已记录来源的远端变化");

  const refresh = useCallback(() => {
    try {
      setItems(inventory());
      setNotice("状态已刷新");
    } catch (error) {
      setItems([]);
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const scanUpdates = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice("正在读取来源并计算差异…");
    try {
      const plans = await planUpdates();
      const next: Record<string, UpdateStatus> = {};
      for (const plan of plans) next[plan.item.record.id] = plan.item.status;
      setUpdates(next);
      setNotice(`扫描完成：${plans.filter((plan) => plan.item.status === "update").length} 个可更新`);
      disposeUpdatePlans(plans);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  useEffect(() => { refresh(); }, [refresh]);

  useInput((input, key) => {
    if (key.escape) onBack();
    else if (input === "r") refresh();
    else if (input === "u") void scanUpdates();
    else if (input === "q") exit();
  });

  const counts = items.reduce((result, item) => {
    const status = statusFor(item, updates);
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {} as Partial<Record<RowStatus, number>>);

  return (
    <ScreenFrame>
      <Title compact />
      <Box width={86} flexDirection="column" borderStyle="round" borderColor={theme.borderStrong} paddingX={2} paddingY={1}>
        <Box justifyContent="space-between">
          <Box flexDirection="column">
            <Text color={theme.text} bold>Skill 管理台</Text>
            <Text color={theme.textMuted}>本机安装状态与来源健康度</Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end">
            <Text color={theme.accent} bold>{items.length} 个目标</Text>
            <Text color={theme.textSubtle}>{counts.update ?? 0} 个更新</Text>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="row" flexWrap="wrap">
          {(["managed", "modified", "missing", "unmanaged"] as RowStatus[]).map((status) => (
            <Text key={status} color={statusLabel[status].color}>
              {statusLabel[status].icon} {statusLabel[status].label} {counts[status] ?? 0}  
            </Text>
          ))}
        </Box>

        <Box marginTop={1} flexDirection="column">
          {items.length === 0 ? (
            <Text color={theme.textMuted}>还没有可管理的 Skill。先回到首页导入一个。</Text>
          ) : items.slice(0, 12).map((item) => {
            const status = statusFor(item, updates);
            const meta = statusLabel[status];
            return (
              <Box key={item.record?.id ?? item.targetPath}>
                <Text color={meta.color} bold>{meta.icon} </Text>
                <Text color={theme.text} bold>{item.agent.padEnd(9)}</Text>
                <Text color={theme.text}>{item.installName.padEnd(27).slice(0, 27)}</Text>
                <Text color={meta.color}>{meta.label.padEnd(8)}</Text>
                <Text color={theme.textSubtle}>{displayPath(item.targetPath)}</Text>
              </Box>
            );
          })}
          {items.length > 12 ? <Text color={theme.textSubtle}>… 还有 {items.length - 12} 个目标</Text> : null}
        </Box>
        <Box marginTop={1}>
          <Text color={theme.textSubtle}>{busy ? "扫描中，请稍候…" : notice}</Text>
        </Box>
      </Box>
      <FooterHint hints={HINTS} />
    </ScreenFrame>
  );
}
