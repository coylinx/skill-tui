// Top-level app state machine. Wires screens together.
// Phase 1 implements: url → cloning (stub) → (skills placeholder).
// Later phases extend the switch with skills/agents/preview/importing/result.

import { useApp, useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { AgentSelect } from "./components/agent-select.js";
import { Cloning } from "./components/cloning.js";
import { Importing } from "./components/importing.js";
import { Naming } from "./components/naming.js";
import { Preview } from "./components/preview.js";
import { Result } from "./components/result.js";
import { SkillList } from "./components/skill-list.js";
import { UrlInput } from "./components/url-input.js";
import { discoverSkills } from "./core/discover.js";
import { cloneRepo } from "./core/repo.js";
import { loadHistory, saveHistory } from "./core/history.js";
import { cacheDir, urlHash } from "./core/paths.js";
import type { AgentId, ImportTask, Screen, Skill } from "./types.js";

export interface AppFlags {
  dryRun: boolean;
  overwrite: boolean;
  noBackup: boolean;
}

function buildTasks(
  skills: Skill[],
  selectedSkillIds: string[],
  agentIds: AgentId[],
): ImportTask[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const tasks: ImportTask[] = [];
  for (const skillId of selectedSkillIds) {
    const skill = byId.get(skillId);
    if (!skill) continue;
    for (const agent of agentIds) tasks.push({ skill, agent });
  }
  return tasks;
}

export function App({
  initialUrl,
  flags,
  onDryRun,
}: {
  initialUrl?: string;
  flags: AppFlags;
  onDryRun?: (report: string) => void;
}) {
  const [screen, setScreen] = useState<Screen>(() => {
    const url = initialUrl?.trim();
    return url ? { kind: "cloning", url } : { kind: "url" };
  });
  const [history, setHistory] = useState<string[]>([]);
  const [cloneError, setCloneError] = useState<string | undefined>();
  const [cloneCachePath, setCloneCachePath] = useState<string>("");
  const [skills, setSkills] = useState<Skill[]>([]);
  // Skills after optional renaming (installName set). Used when building
  // import tasks so the target folder reflects the user's chosen name.
  const [renamedSkills, setRenamedSkills] = useState<Skill[]>([]);
  // Remember the skills-screen context (repoDir + url) so the preview's
  // back button can return to agent-select → skills without losing state.
  const skillsCtx = useRef<{ repoDir: string; url: string }>({ repoDir: "", url: "" });

  // Load URL history on mount.
  useEffect(() => {
    loadHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

  // Drive cloning when we enter that screen.
  useEffect(() => {
    if (screen.kind !== "cloning") return;
    const controller = new AbortController();
    setCloneError(undefined);
    // Pre-compute the cache path for display.
    urlHash(screen.url).then((h) => {
      if (!controller.signal.aborted) setCloneCachePath(`${cacheDir}/${h}`);
    });
    cloneRepo(screen.url, controller.signal)
      .then(async (res) => {
        if (controller.signal.aborted) return;
        await saveHistory(screen.url);
        if (controller.signal.aborted) return;
        const found = discoverSkills(res.dir);
        setSkills(found);
        skillsCtx.current = { repoDir: res.dir, url: screen.url };
        setScreen({ kind: "skills", repoDir: res.dir, url: screen.url });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setCloneError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [screen]);

  // Global keys: Ctrl+C always quits (raw mode swallows SIGINT, so the
  // signal handler in index.tsx never fires while the TUI is up). Cloning
  // owns its Escape behavior here because that screen is presentational;
  // all other screens provide their own precise back target.
  const { exit } = useApp();
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }
    if (key.escape && screen.kind === "cloning") {
      setScreen({ kind: "url" });
    }
  });

  switch (screen.kind) {
    case "url":
      return (
        <UrlInput
          initialValue={initialUrl}
          history={history}
          onSubmit={(url) => setScreen({ kind: "cloning", url })}
        />
      );

    case "cloning":
      return (
        <Cloning url={screen.url} cachePath={cloneCachePath} error={cloneError} />
      );

    case "skills":
      return (
        <SkillList
          url={screen.url}
          skills={skills}
          onConfirm={(selectedIds) =>
            setScreen({
              kind: "naming",
              repoDir: screen.repoDir,
              url: screen.url,
              selected: selectedIds,
            })
          }
          onBack={() => setScreen({ kind: "url" })}
        />
      );

    case "naming": {
      const selectedSkills = screen.selected
        .map((id) => skills.find((s) => s.id === id))
        .filter((s): s is Skill => Boolean(s));
      return (
        <Naming
          skills={selectedSkills}
          onConfirm={(renamed) => {
            setRenamedSkills(renamed);
            setScreen({
              kind: "agents",
              repoDir: screen.repoDir,
              url: screen.url,
              selected: renamed.map((s) => s.id),
            });
          }}
          onBack={() => setScreen({ kind: "skills", repoDir: screen.repoDir, url: screen.url })}
        />
      );
    }

    case "agents":
      return (
        <AgentSelect
          onConfirm={(agentIds) => {
            const tasks = buildTasks(renamedSkills, screen.selected, agentIds);
            setScreen({
              kind: "preview",
              tasks,
              overwrite: flags.overwrite,
              dryRun: flags.dryRun,
            });
          }}
          onBack={() =>
            setScreen({
              kind: "naming",
              repoDir: screen.repoDir,
              url: screen.url,
              selected: screen.selected,
            })
          }
        />
      );

    case "preview":
      return (
        <Preview
          tasks={screen.tasks}
          dryRun={screen.dryRun}
          noBackup={flags.noBackup}
          initialOverwrite={screen.overwrite}
          onDryRun={onDryRun}
          onConfirm={(overwrite) =>
            setScreen({ kind: "importing", tasks: screen.tasks, overwrite })
          }
          onBack={() => {
            // back to agent select with the remembered skills context
            const skillIds = [...new Set(screen.tasks.map((t) => t.skill.id))];
            setScreen({
              kind: "agents",
              repoDir: skillsCtx.current.repoDir,
              url: skillsCtx.current.url,
              selected: skillIds,
            });
          }}
        />
      );

    case "importing":
      return (
        <Importing
          tasks={screen.tasks}
          overwrite={screen.overwrite}
          noBackup={flags.noBackup}
          onComplete={(results) =>
            setScreen({
              kind: "result",
              summary: { results, url: skillsCtx.current.url },
            })
          }
        />
      );

    case "result":
      return (
        <Result
          summary={screen.summary}
          onRestart={() => setScreen({ kind: "url" })}
        />
      );
  }
}
