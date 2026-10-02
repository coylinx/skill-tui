// Skill management dashboard. Inventory is read-only; update execution keeps
// the same plan → confirmation → importer boundary as the CLI command.
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import { displayPath } from "../core/agents.js";
import { inventory } from "../core/inventory.js";
import {
  applyUpdatePlan,
  disposeUpdatePlans,
  planUpdates,
  type PreparedUpdate,
} from "../core/update.js";
import type { InventoryItem, UpdateStatus } from "../types.js";
import { theme } from "../theme.js";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";

const OVERVIEW_HINTS: Hint[] = [
  { key: "u", label: "扫描更新" },
  { key: "r", label: "刷新" },
  { key: "Esc", label: "返回" },
];
const SELECT_HINTS: Hint[] = [
  { key: "Space", label: "选择" },
  { key: "a", label: "全选安全项" },
  { key: "Enter", label: "预览" },
  { key: "Esc", label: "返回" },
];
const CONFIRM_HINTS: Hint[] = [
  { key: "Enter", label: "执行更新" },
  { key: "f", label: "允许覆盖本地改动" },
  { key: "Esc", label: "返回选择" },
];

type RowStatus = InventoryItem["status"] | UpdateStatus;
type ManagerMode = "overview" | "select" | "confirm" | "working";

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

function changeText(plan: PreparedUpdate): string {
  if (plan.item.status === "missing") return "目标缺失，可重新安装";
  if (plan.item.changes.length === 0) return plan.item.message ?? "无文件差异";
  const counts = { added: 0, modified: 0, removed: 0 };
  for (const change of plan.item.changes) counts[change.kind] += 1;
  return `+${counts.added} 新增  ~${counts.modified} 修改  -${counts.removed} 删除`;
}

export function Manager({ onBack }: { onBack: () => void }) {
  const { exit } = useApp();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [plans, setPlans] = useState<PreparedUpdate[]>([]);
  const [updates, setUpdates] = useState<Record<string, UpdateStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<ManagerMode>("overview");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("按 u 扫描已记录来源的变化");
  const plansRef = useRef<PreparedUpdate[]>([]);

  const refresh = useCallback(() => {
    disposeUpdatePlans(plansRef.current);
    plansRef.current = [];
    try {
      setItems(inventory());
      setPlans([]);
      setUpdates({});
      setSelected(new Set());
      setMode("overview");
      setNotice("状态已刷新");
    } catch (error) {
      setItems([]);
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const actionablePlans = plans.filter((plan) =>
    plan.item.status === "update" || plan.item.status === "missing" || plan.item.status === "modified",
  );

  const scanUpdates = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice("正在读取来源并计算差异…");
    try {
      const nextPlans = await planUpdates();
      disposeUpdatePlans(plansRef.current);
      plansRef.current = nextPlans;
      setPlans(nextPlans);
      const nextUpdates: Record<string, UpdateStatus> = {};
      for (const plan of nextPlans) nextUpdates[plan.item.record.id] = plan.item.status;
      setUpdates(nextUpdates);
      const safe = nextPlans.filter((plan) => plan.item.status === "update" || plan.item.status === "missing");
      setSelected(new Set(safe.map((plan) => plan.item.record.id)));
      setCursor(0);
      if (safe.length > 0) setMode("select");
      else setNotice("扫描完成：没有可直接更新的目标");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const executeSelected = useCallback(() => {
    const chosen = actionablePlans.filter((plan) => selected.has(plan.item.record.id));
    if (chosen.length === 0) {
      setNotice("至少选择一个更新目标");
      setMode("select");
      return;
    }
    if (!force && chosen.some((plan) => plan.item.status === "modified")) {
      setNotice("选中的目标有本地改动；按 f 明确允许覆盖");
      return;
    }
    setMode("working");
    const results = applyUpdatePlan(chosen, force);
    const done = results.filter((result) => result.status === "done").length;
    const failed = results.filter((result) => result.status === "failed").length;
    disposeUpdatePlans(plansRef.current);
    plansRef.current = [];
    setPlans([]);
    setUpdates({});
    setSelected(new Set());
    setForce(false);
    refresh();
    setNotice(`更新完成：${done} 成功${failed ? `，${failed} 失败` : ""}`);
  }, [actionablePlans, force, refresh, selected]);

  useEffect(() => {
    refresh();
    return () => disposeUpdatePlans(plansRef.current);
  }, [refresh]);

  useInput((input, key) => {
    if (mode === "overview") {
      if (key.escape) onBack();
      else if (input === "r") refresh();
      else if (input === "u") void scanUpdates();
      else if (input === "q") exit();
      return;
    }
    if (mode === "select") {
      if (key.escape) {
        setMode("overview");
      } else if (key.upArrow && actionablePlans.length > 0) {
        setCursor((value) => (value - 1 + actionablePlans.length) % actionablePlans.length);
      } else if (key.downArrow && actionablePlans.length > 0) {
        setCursor((value) => (value + 1) % actionablePlans.length);
      } else if (key.return) {
        setMode("confirm");
      } else if (input === " ") {
        const id = actionablePlans[cursor]?.item.record.id;
        if (id) setSelected((current) => toggleSet(current, id));
      } else if (input.toLowerCase() === "a") {
        setSelected((current) => {
          const safe = actionablePlans.filter((plan) => plan.item.status !== "modified").map((plan) => plan.item.record.id);
          const allSelected = safe.every((id) => current.has(id));
          const next = new Set(current);
          for (const id of safe) allSelected ? next.delete(id) : next.add(id);
          return next;
        });
      }
      return;
    }
    if (mode === "confirm") {
      if (key.escape) setMode("select");
      else if (input.toLowerCase() === "f") setForce((value) => !value);
      else if (key.return) executeSelected();
    }
  });

  const counts = items.reduce((result, item) => {
    const status = statusFor(item, updates);
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {} as Partial<Record<RowStatus, number>>);

  return (
    <ScreenFrame>
      <Title compact />
      {mode === "overview" ? (
        <Overview items={items} counts={counts} busy={busy} notice={notice} updates={updates} />
      ) : mode === "select" ? (
        <UpdateSelection plans={actionablePlans} cursor={cursor} selected={selected} notice={notice} />
      ) : mode === "confirm" ? (
        <UpdateConfirmation plans={actionablePlans.filter((plan) => selected.has(plan.item.record.id))} force={force} />
      ) : (
        <Box width={86} flexDirection="column" borderStyle="round" borderColor={theme.borderStrong} paddingX={2} paddingY={2}>
          <Text color={theme.accent} bold>正在更新 Skill…</Text>
          <Text color={theme.textMuted}>写入完成后会重新检查目标状态。</Text>
        </Box>
      )}
      <FooterHint hints={mode === "overview" ? OVERVIEW_HINTS : mode === "select" ? SELECT_HINTS : CONFIRM_HINTS} />
    </ScreenFrame>
  );
}

function Overview({
  items,
  counts,
  busy,
  notice,
  updates,
}: {
  items: InventoryItem[];
  counts: Partial<Record<RowStatus, number>>;
  busy: boolean;
  notice: string;
  updates: Record<string, UpdateStatus>;
}) {
  return (
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
      <Box marginTop={1}><Text color={theme.textSubtle}>{busy ? "扫描中，请稍候…" : notice}</Text></Box>
    </Box>
  );
}

function UpdateSelection({
  plans,
  cursor,
  selected,
  notice,
}: {
  plans: PreparedUpdate[];
  cursor: number;
  selected: Set<string>;
  notice: string;
}) {
  return (
    <Box width={86} flexDirection="column" borderStyle="round" borderColor={theme.borderStrong} paddingX={2} paddingY={1}>
      <Box justifyContent="space-between">
        <Text color={theme.accent} bold>选择要更新的目标</Text>
        <Text color={theme.textMuted}>已选 {selected.size}/{plans.length}</Text>
      </Box>
      <Text color={theme.textSubtle}>Enter 查看变更预览；本地改动项不会被默认选中。</Text>
      <Box marginTop={1} flexDirection="column">
        {plans.length === 0 ? <Text color={theme.textMuted}>没有可更新目标。</Text> : plans.map((plan, index) => {
          const status = plan.item.status;
          const meta = statusLabel[status];
          const id = plan.item.record.id;
          return (
            <Box key={id} backgroundColor={index === cursor ? theme.panelRaised : undefined}>
              <Text color={index === cursor ? theme.accent : theme.textMuted}>{index === cursor ? "▸" : " "}</Text>
              <Text color={selected.has(id) ? theme.success : theme.textMuted}>{selected.has(id) ? " ◉" : " ◯"}</Text>
              <Text color={theme.text} bold={index === cursor}>{"  "}{plan.item.record.agent}/{plan.item.record.installName}</Text>
              <Text color={meta.color}>{`  ${meta.label}`}</Text>
              <Text color={theme.textSubtle}>{`  ${changeText(plan)}`}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}><Text color={theme.textSubtle}>{notice}</Text></Box>
    </Box>
  );
}

function UpdateConfirmation({ plans, force }: { plans: PreparedUpdate[]; force: boolean }) {
  const hasModified = plans.some((plan) => plan.item.status === "modified");
  return (
    <Box width={86} flexDirection="column" borderStyle="round" borderColor={force ? theme.warning : theme.borderStrong} paddingX={2} paddingY={1}>
      <Text color={force ? theme.warning : theme.accent} bold>更新预览 — 确认后写入</Text>
      <Text color={theme.text}>{plans.length} 个目标将通过事务导入并自动备份旧版本。</Text>
      {plans.map((plan) => (
        <Box key={plan.item.record.id} flexDirection="column" marginTop={1}>
          <Text color={theme.text} bold>{plan.item.record.agent}/{plan.item.record.installName}</Text>
          <Text color={theme.textMuted}>  {changeText(plan)}{plan.item.status === "modified" ? " · 目标有本地改动" : ""}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        {hasModified && !force ? (
          <Text color={theme.warning}>检测到本地改动；按 f 后才允许覆盖。</Text>
        ) : (
          <Text color={force ? theme.warning : theme.success}>{force ? "已开启强制覆盖本地改动" : "安全模式：仅更新未改动目标"}</Text>
        )}
      </Box>
    </Box>
  );
}

function toggleSet(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
