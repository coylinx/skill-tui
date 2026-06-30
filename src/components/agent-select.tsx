// Screen ④: target agent multi-select with three-state detection.
// Each row shows: checkbox · label · status badge (✓/⚠/✗) · target path.
// Enter → onConfirm(selected agent ids); Esc → onBack.

import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { CheckboxList, type CheckboxItem } from "./checkbox-list.js";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";
import { probeAgents, displayPath, type AgentInfo } from "../core/agents.js";
import { theme } from "../theme.js";
import type { AgentId } from "../types.js";

const HINTS: Hint[] = [
  { key: "↑↓", label: "移动" },
  { key: "Space", label: "勾选" },
  { key: "Enter", label: "下一步(预览)" },
  { key: "Esc", label: "返回" },
];

interface Props {
  onConfirm: (agentIds: AgentId[]) => void;
  onBack: () => void;
}

const STATUS_GLYPH: Record<AgentInfo["status"], { ch: string; color: string; text: string }> = {
  installed: { ch: "✓", color: theme.success, text: "已安装" },
  configured: { ch: "⚠", color: theme.warning, text: "仅配置" },
  missing: { ch: "✗", color: theme.danger, text: "未检测" },
};

export function AgentSelect({ onConfirm, onBack }: Props) {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string>("");

  // Probe agent installation state on mount.
  useEffect(() => {
    let alive = true;
    probeAgents().then((info) => {
      if (!alive) return;
      setAgents(info);
      // Default-select NOTHING — the user must explicitly opt in to each
      // target agent. Pre-selecting all would cause accidental mass installs.
      setSelected(new Set());
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!agents) {
    return (
      <ScreenFrame>
        <Title />
        <Text dimColor color={theme.textMuted}>
          正在探测已安装的 Agent …
        </Text>
      </ScreenFrame>
    );
  }

  const items: CheckboxItem[] = agents.map((a) => {
    const st = STATUS_GLYPH[a.status];
    const path = displayPath(a.skillsDir);
    return {
      id: a.id,
      label: `${a.label}  ${st.ch} ${st.text}`,
      hint: `→ ${path}${a.wiring ?? ""}`,
    };
  });

  function toggle(id: string) {
    setNotice("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    if (selected.size === 0) {
      setNotice("请至少用 Space 勾选一个目标 Agent");
      return;
    }
    onConfirm([...selected] as AgentId[]);
  }

  return (
    <ScreenFrame>
      <Title />
      <CheckboxList
        title="选择目标 Agent"
        items={items}
        selected={selected}
        onToggle={toggle}
        onConfirm={confirm}
        onBack={onBack}
      />
      {notice ? (
        <Box marginTop={1}>
          <Text color={theme.danger}>{notice}</Text>
        </Box>
      ) : null}
      <FooterHint hints={HINTS} />
    </ScreenFrame>
  );
}
