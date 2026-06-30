// Screen ①: Git URL input with history recall (↑/↓) and a bordered field.
// Enter → onSubmit(url); Esc → onExit. Supports a pre-filled initial value
// (e.g. when launched as `skill <url>`).

import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState } from "react";
import { theme } from "../theme.js";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";

const HINTS: Hint[] = [
  { key: "Enter", label: "确认" },
  { key: "↑↓", label: "历史" },
  { key: "Esc", label: "退出" },
];

interface Props {
  initialValue?: string;
  history: string[];
  onSubmit: (url: string) => void;
}

export function UrlInput({ initialValue, history, onSubmit }: Props) {
  const { exit } = useApp();
  const [value, setValue] = useState(initialValue ?? "");
  const [histIndex, setHistIndex] = useState<number>(-1); // -1 = editing live

  // If launched with a URL arg, auto-advance once the history has loaded.
  useEffect(() => {
    if (initialValue && initialValue.trim()) {
      onSubmit(initialValue.trim());
    }
    // run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recall(dir: -1 | 1) {
    if (history.length === 0) return;
    setHistIndex((prev) => {
      let next = prev === -1 ? (dir === 1 ? 0 : history.length - 1) : prev + dir;
      next = Math.max(0, Math.min(history.length - 1, next));
      setValue(history[next]);
      return next;
    });
  }

  useInput((_input, key) => {
    if (key.upArrow) {
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
      <Title />

      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Text color={theme.text} bold>
          输入 Skill 仓库的 Git 地址
        </Text>

        <Box
          marginTop={1}
          paddingX={1}
          borderStyle="round"
          borderColor={theme.border}
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

        <FooterHint hints={HINTS} />
      </Box>
    </ScreenFrame>
  );
}
