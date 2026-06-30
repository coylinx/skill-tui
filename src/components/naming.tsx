// Screen ③b: rename the install folder for each selected skill.
// Lists every selected skill with an editable install-name field.
// ↑/↓ moves between fields, typing edits the focused name, Enter confirms
// all and proceeds to agent selection. Esc goes back to the skill list.
//
// The install name becomes the /command name in Claude Code / Codex, so this
// is where the user controls what the skill folder is called on disk.

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
  { key: "Enter", label: "确认" },
  { key: "Esc", label: "返回" },
];

interface Props {
  skills: Skill[]; // only the selected ones
  onConfirm: (renamed: Skill[]) => void;
  onBack: () => void;
}

// Sanitize a folder name: lowercase letters, numbers, hyphens only (the
// Agent Skills naming constraint). Anything else becomes a hyphen.
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
  const [editing, setEditing] = useState(false);

  // If a skill list refresh changes the selection, re-init.
  useEffect(() => {
    setNames(skills.map((s) => s.installName ?? s.name));
  }, [skills]);

  useInput((input, key) => {
    if (editing) {
      // While editing, only Enter exits edit mode; arrow keys stay in the field.
      if (key.return) {
        setNames((prev) => {
          const next = [...prev];
          next[cursor] = sanitize(next[cursor]) || skills[cursor].name;
          return next;
        });
        setEditing(false);
      } else if (key.escape) {
        setEditing(false);
      }
      return;
    }
    if (key.upArrow) {
      setCursor((c) => (c - 1 + skills.length) % skills.length);
    } else if (key.downArrow) {
      setCursor((c) => (c + 1) % skills.length);
    } else if (key.return) {
      // Confirm all: apply sanitized names and proceed.
      const finalNames = names.map((n, i) => sanitize(n) || skills[i].name);
      const renamed = skills.map((s, i) => ({ ...s, installName: finalNames[i] }));
      onConfirm(renamed);
    } else if (key.escape) {
      onBack();
    } else if (input === " " || (input && !key.ctrl && !key.meta && input.length === 1)) {
      // Start editing the focused name.
      setEditing(true);
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
          <Text color={theme.accent} bold>
            命名安装文件夹（即 Agent 里的 /命令名）
          </Text>
        </Box>

        {skills.map((skill, i) => {
          const focused = i === cursor;
          return (
            <Box key={skill.id} flexDirection="row" alignItems="center">
              <Text color={focused ? theme.accent : theme.textMuted}>
                {focused ? "▸" : " "}
              </Text>
              <Text color={theme.text} dimColor={!focused}>
                {" "}
                {skill.name.padEnd(24)}
              </Text>
              <Text color={theme.textMuted}>→ </Text>
              {focused && editing ? (
                <TextInput
                  value={names[i]}
                  onChange={(v) =>
                    setNames((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      return next;
                    })
                  }
                  showCursor
                />
              ) : (
                <Text color={focused ? theme.accent : theme.text} bold={focused}>
                  {names[i] || skill.name}
                </Text>
              )}
            </Box>
          );
        })}

        <Box marginTop={1}>
          <Text dimColor>
            {editing ? "输入名称 · Enter 确认本项" : "选中一项开始输入（字母/数字/-）"}
          </Text>
        </Box>
      </Box>

      <FooterHint hints={HINTS} />
    </ScreenFrame>
  );
}
