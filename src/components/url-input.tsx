// Screen ①: Git URL input with history recall (↑/↓) and a bordered field.
// Enter → onSubmit(url); Esc → onExit. Supports a pre-filled initial value
// for callers that want to pre-fill the field. App handles CLI auto-advance.

import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { useRef, useState } from "react";
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
  const draft = useRef(initialValue ?? "");

  useInput((_input, key) => {
    if (key.upArrow) {
      if (history.length === 0) return;
      if (histIndex === -1) draft.current = value;
      const next = Math.min(histIndex + 1, history.length - 1);
      setHistIndex(next);
      setValue(history[next]);
    } else if (key.downArrow) {
      if (histIndex === -1) return;
      const next = histIndex - 1;
      if (next < 0) {
        setHistIndex(-1);
        setValue(draft.current);
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
            onChange={(next) => {
              setValue(next);
              setHistIndex(-1);
            }}
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
