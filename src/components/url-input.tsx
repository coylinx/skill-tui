// Screen ①: Git URL input with history recall (↑/↓) and a bordered field.
// Enter → onSubmit(url); Esc → onExit. Supports a pre-filled initial value
// (e.g. when launched as `skilltui <url>`).

import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { theme } from "../theme.js";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";

const HINTS: Hint[] = [
  { key: "Enter", label: "确认" },
  { key: "m", label: "管理台" },
  { key: "↑↓", label: "历史" },
  { key: "Esc", label: "退出" },
];

interface Props {
  initialValue?: string;
  history: string[];
  onSubmit: (url: string) => void;
  onManage?: () => void;
}

export function UrlInput({ initialValue, history, onSubmit, onManage }: Props) {
  const { exit } = useApp();
  const [value, setValue] = useState(initialValue ?? "");
  const [histIndex, setHistIndex] = useState<number>(-1); // -1 = editing live

  function recall(dir: -1 | 1) {
    if (history.length === 0) return;
    setHistIndex((prev) => {
      let next = prev === -1 ? (dir === 1 ? 0 : history.length - 1) : prev + dir;
      next = Math.max(0, Math.min(history.length - 1, next));
      setValue(history[next]);
      return next;
    });
  }

  useInput((input, key) => {
    if (onManage && input === "m" && value.trim() === "") {
      onManage();
    } else if (key.upArrow) {
      recall(-1);
    } else if (key.downArrow) {
      if (histIndex === -1) return;
      const next = histIndex + 1;
      if (next >= history.length) {
        setHistIndex(-1);
        setValue("");
      } else {
        setHistIndex(next);
        setValue(history[next]);
      }
    } else if (key.escape) {
      exit();
    }
  });

  function submit(raw: string) {
    const url = raw.trim();
    if (!url) return;
    onSubmit(url);
  }

  return (
    <ScreenFrame>
      <Title stage={1} />

      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Box flexDirection="row" alignItems="center">
          <Text color={theme.accentWarm} bold>● </Text>
          <Text color={theme.text} bold>输入 Skill 仓库的 Git 地址</Text>
        </Box>
        <Text color={theme.textMuted} dimColor>
          粘贴 GitHub、GitLab 或任意可访问的 Git 仓库
        </Text>

        <Box
          marginTop={1}
          paddingX={1}
          borderStyle="round"
          borderColor={theme.borderStrong}
          backgroundColor={theme.panel}
          minWidth={50}
        >
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="https://github.com/user/skills.git"
            showCursor
          />
        </Box>

        {history.length > 0 ? (
          <Box marginTop={1}>
            <Text color={theme.textSubtle} dimColor>
              ↑↓ 浏览最近 {history.length} 个仓库
            </Text>
          </Box>
        ) : null}

        <FooterHint hints={HINTS} />
      </Box>
    </ScreenFrame>
  );
}
