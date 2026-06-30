// Screen ③b: rename the install folder for each selected skill.
//
// Interaction model (no separate "edit mode"):
//   • Every row shows its install name in a bordered input box.
//   • The focused row's box has an accent border; others are dim.
//   • Typing edits the focused row directly — no "enter edit mode" step.
//   • ↑/↓ moves focus between rows.
//   • Enter confirms all (sanitized) and proceeds.
//   • Esc goes back to the skill list.
//
// The install name becomes the /command name in Claude Code / Codex.

import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { theme } from "../theme.js";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";
import type { Skill } from "../types.js";

const HINTS: Hint[] = [
  { key: "↑↓", label: "切换" },
  { key: "直接输入", label: "改名" },
  { key: "Enter", label: "确认" },
  { key: "Esc", label: "返回" },
];

interface Props {
  skills: Skill[]; // only the selected ones
  onConfirm: (renamed: Skill[]) => void;
  onBack: () => void;
}

// Sanitize a folder name: lowercase letters, numbers, hyphens only.
function sanitize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Naming({ skills, onConfirm, onBack }: Props) {
  const [names, setNames] = useState<string[]>(() =>
    skills.map((s) => s.installName ?? s.name),
  );
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    setNames(skills.map((s) => s.installName ?? s.name));
  }, [skills]);

  function setNameAt(i: number, v: string) {
    setNames((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  // Handle navigation + confirm/back. Arrow keys move focus; Enter confirms;
  // Esc goes back. TextInput handles character input for the focused row.
  useInput((_input, key) => {
    if (key.upArrow) {
      setCursor((c) => (c - 1 + skills.length) % skills.length);
    } else if (key.downArrow) {
      setCursor((c) => (c + 1) % skills.length);
    } else if (key.return) {
      const finalNames = names.map((n, i) => sanitize(n) || skills[i].name);
      const renamed = skills.map((s, i) => ({ ...s, installName: finalNames[i] }));
      onConfirm(renamed);
    } else if (key.escape) {
      onBack();
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
        minWidth={64}
      >
        <Box marginBottom={1}>
          <Text color={theme.accent} bold>
            命名安装文件夹（即 Agent 里的 /命令名）
          </Text>
        </Box>

        {skills.map((skill, i) => {
          const focused = i === cursor;
          return (
            <Box key={skill.id} flexDirection="column" marginBottom={1}>
              {/* Original name label */}
              <Box flexDirection="row">
                <Text color={focused ? theme.accent : theme.textMuted}>
                  {focused ? "▸ " : "  "}
                </Text>
                <Text color={theme.text} dimColor>
                  {skill.name}
                </Text>
              </Box>
              {/* Bordered input box — focused row is editable, others are static.
                  The box needs height=3 so the border top/bottom sit on their
                  own lines and the text doesn't overlap the border. */}
              <Box
                marginLeft={2}
                marginTop={0}
                width={48}
                height={3}
                borderStyle="round"
                borderColor={focused ? theme.accent : theme.border}
                backgroundColor={focused ? theme.panel : undefined}
                alignItems="center"
                paddingLeft={1}
              >
                {focused ? (
                  <TextInput
                    value={names[i]}
                    onChange={(v) => setNameAt(i, v)}
                    showCursor
                  />
                ) : (
                  <Text color={theme.textMuted}>{names[i] || skill.name}</Text>
                )}
              </Box>
            </Box>
          );
        })}

        <Box>
          <Text dimColor color={theme.textMuted}>
            直接输入改名 · ↑↓ 切换 · Enter 确认 · Esc 返回
          </Text>
        </Box>
      </Box>

      <FooterHint hints={HINTS} />
    </ScreenFrame>
  );
}
