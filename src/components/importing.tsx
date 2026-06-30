// Screen ⑥: importing in progress with a live progress list.
// Runs importTask() for each task with bounded concurrency (default 4),
// then calls onComplete with all results once everything finishes.

import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";
import { ProgressBar } from "./progress-bar.js";
import { importTask } from "../core/importer.js";
import { theme } from "../theme.js";
import type { ImportResult, ImportTask } from "../types.js";

interface Props {
  tasks: ImportTask[];
  overwrite: boolean;
  noBackup: boolean;
  onComplete: (results: ImportResult[]) => void;
}

const CONCURRENCY = 4;

export function Importing({ tasks, overwrite, noBackup, onComplete }: Props) {
  const total = tasks.length;
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [current, setCurrent] = useState<string>("");
  // Accumulate results in a ref so the completion check reads the full set
  // regardless of which worker finished last.
  const acc = useRef<ImportResult[]>([]);
  const completed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const opts = { overwrite, noBackup };
    const queue = [...tasks];

    async function worker() {
      while (queue.length > 0 && !cancelled) {
        const task = queue.shift()!;
        setCurrent(`${task.skill.installName ?? task.skill.name} → ${task.agent}`);
        // yield to the event loop so the UI can repaint between tasks
        await new Promise((r) => setTimeout(r, 0));
        const res = importTask(task, opts);
        if (cancelled) return;
        acc.current.push(res);
        setResults([...acc.current]);
        setDone((d) => d + 1);
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, total) },
      () => worker(),
    );
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire onComplete exactly once when all tasks are done.
  useEffect(() => {
    if (!completed.current && done === total && total > 0) {
      completed.current = true;
      setCurrent("");
      onComplete(acc.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, total]);

  const sorted = [...results].reverse(); // most recent first

  return (
    <ScreenFrame>
      <Title />

      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color={theme.accent} bold>
          导入中…
        </Text>
        <Box marginTop={1}>
          <ProgressBar value={done} total={total} />
        </Box>
        {current ? (
          <Text dimColor color={theme.textMuted}>
            {current}
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column">
        {sorted.slice(0, 12).map((r, i) => (
          <Box key={i} flexDirection="row">
            <Text
              color={
                r.status === "done"
                  ? theme.success
                  : r.status === "failed"
                    ? theme.danger
                    : theme.warning
              }
            >
              {r.status === "done" ? "✓" : r.status === "failed" ? "✗" : "◷"}
            </Text>
            <Text dimColor color={theme.textMuted}>
              {" "}
              {r.action === "overwrite" ? "↻ " : ""}
              {r.targetPath.replace(/\\/g, "/").split("/").slice(-2).join("/")}
              {r.message ? ` — ${r.message}` : ""}
            </Text>
          </Box>
        ))}
      </Box>
    </ScreenFrame>
  );
}
