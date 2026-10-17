// Reusable multi-select checkbox list.
// Keys: ↑/↓ move, Space toggle, a toggle-all, Enter confirm, Esc back.
// Pure presentational + input; the caller owns the selected set via callbacks.

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { theme } from "../theme.js";

export interface CheckboxItem {
  id: string;
  label: string;
  hint?: string; // right-aligned secondary text
}

interface Props {
  title: string;
  items: CheckboxItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  emptyText?: string;
}

export function CheckboxList({
  title,
  items,
  selected,
  onToggle,
  onConfirm,
  onBack,
  emptyText = "未发现任何条目",
}: Props) {
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (items.length === 0) {
      if (key.escape) onBack();
      return;
    }
    if (key.upArrow) {
      setCursor((c) => (c - 1 + items.length) % items.length);
    } else if (key.downArrow) {
      setCursor((c) => (c + 1) % items.length);
    } else if (key.return) {
      onConfirm();
    } else if (key.escape) {
      onBack();
    } else {
      const ch = _input.toLowerCase();
      if (ch === " ") {
        onToggle(items[cursor].id);
      } else if (ch === "a") {
        // toggle all
        const allSelected = items.every((i) => selected.has(i.id));
        for (const item of items) {
          if (allSelected === selected.has(item.id)) onToggle(item.id);
        }
      }
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingX={2} width="100%">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
        width="100%"
      >
        <Box marginBottom={1} justifyContent="space-between" flexWrap="wrap">
          <Text color={theme.accent} bold>{title}</Text>
          {items.length > 0 ? (
            <Text color={theme.textMuted}>已选 {selected.size}/{items.length}</Text>
          ) : null}
        </Box>

        {items.length === 0 ? (
          <Text color={theme.textMuted}>{emptyText}</Text>
        ) : (
          items.map((item, i) => {
            const checked = selected.has(item.id);
            const isCursor = i === cursor;
            return (
              <Box key={item.id} flexDirection="row" flexWrap="wrap" backgroundColor={isCursor ? theme.panelRaised : undefined}>
                <Text color={isCursor ? theme.accent : theme.textMuted}>{isCursor ? "▸" : " "}</Text>
                <Text color={checked ? theme.success : theme.textMuted}>{checked ? " ◉" : " ◯"}</Text>
                <Text color={isCursor ? theme.text : theme.textMuted} bold={isCursor}>
                  {"  "}{item.label}
                </Text>
                {item.hint ? <Text dimColor color={theme.textSubtle}>{"  "}{item.hint}</Text> : null}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
