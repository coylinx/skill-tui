// Screen ②: cloning in progress. Calls onReady once the repo is available;
// the actual clone work is driven by the app state machine via an effect,
// so this screen is mostly presentational + shows errors.

import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { Loading } from "./spinner.js";
import { Title } from "./title.js";

interface Props {
  url: string;
  cachePath: string;
  error?: string;
}

export function Cloning({ url, cachePath, error }: Props) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingX={2}>
      <Title />

      <Box flexDirection="column" alignItems="center" marginTop={1}>
        {error ? (
          <>
            <Text color={theme.danger} bold>
              ✗ 克隆失败
            </Text>
            <Text color={theme.danger}>{error}</Text>
            <Text dimColor color={theme.textMuted}>
              按 Esc 返回重新输入
            </Text>
          </>
        ) : (
          <>
            <Loading label={`正在克隆 ${url} …`} />
            <Box marginTop={1}>
              <Text dimColor color={theme.textMuted}>
                目标缓存: {cachePath}
              </Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
