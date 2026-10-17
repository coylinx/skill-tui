// Screen ②: cloning in progress. Calls onReady once the repo is available;
// the actual clone work is driven by the app state machine via an effect,
// so this screen is mostly presentational + shows errors.

import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { ScreenFrame } from "./screen-frame.js";
import { Loading } from "./spinner.js";
import { Title } from "./title.js";

interface Props {
  url: string;
  cachePath: string;
  local?: boolean;
  error?: string;
}

export function Cloning({ url, cachePath, local = false, error }: Props) {
  return (
    <ScreenFrame>
      <Title stage={2} />

      <Box flexDirection="column" alignItems="center" marginTop={1}>
        {error ? (
          <>
            <Text color={theme.danger} bold>
              ✗ 来源读取失败
            </Text>
            <Text color={theme.danger}>{error}</Text>
            <Box marginTop={1}>
              <Text dimColor color={theme.textMuted}>
                按 Esc 返回重新输入
              </Text>
            </Box>
          </>
        ) : (
          <>
            <Loading label={`${local ? "正在读取本地目录" : "正在克隆"} ${url} …`} />
            <Box marginTop={1}>
              <Text dimColor color={theme.textMuted}>
                {local ? "本地目录" : "目标缓存"}: {cachePath}
              </Text>
            </Box>
          </>
        )}
      </Box>
    </ScreenFrame>
  );
}
