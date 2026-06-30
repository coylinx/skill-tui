// Top-level app state machine. Wires screens together.
// Phase 1 implements: url → cloning (stub) → (skills placeholder).
// Later phases extend the switch with skills/agents/preview/importing/result.

import { useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import { AgentSelect } from "./components/agent-select.js";
import { Cloning } from "./components/cloning.js";
import { Importing } from "./components/importing.js";
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

export function App({ initialUrl, flags }: { initialUrl?: string; flags: AppFlags }) {
  const [screen, setScreen] = useState<Screen>({ kind: "url" });
  const [history, setHistory] = useState<string[]>([]);
  const [cloneError, setCloneError] = useState<string | undefined>();
  const [cloneCachePath, setCloneCachePath] = useState<string>("");
  const [skills, setSkills] = useState<Skill[]>([]);
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
    setCloneError(undefined);
    // Pre-compute the cache path for display.
    urlHash(screen.url).then((h) => setCloneCachePath(`${cacheDir}/${h}`));
    cloneRepo(screen.url)
      .then(async (res) => {
        await saveHistory(screen.url);
        const found = discoverSkills(res.dir);
        setSkills(found);
        skillsCtx.current = { repoDir: res.dir, url: screen.url };
        setScreen({ kind: "skills", repoDir: res.dir, url: screen.url });
      })
      .catch((err: unknown) => {
        setCloneError(err instanceof Error ? err.message : String(err));
      });
  }, [screen]);

  // Global Esc returns to URL input from cloning error / skills placeholder.
  useInput((_input, key) => {
    if (key.escape && screen.kind !== "url") {
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
              kind: "agents",
              repoDir: screen.repoDir,
              url: screen.url,
              selected: selectedIds,
            })
          }
        />
      );

    case "agents":
      return (
        <AgentSelect
          onConfirm={(agentIds) => {
            const tasks = buildTasks(skills, screen.selected, agentIds);
            setScreen({
              kind: "preview",
              tasks,
              overwrite: false,
              dryRun: flags.dryRun,
            });
          }}
          onBack={() => setScreen({ kind: "skills", repoDir: screen.repoDir, url: screen.url })}
        />
      );

    case "preview":
      return (
        <Preview
          tasks={screen.tasks}
          dryRun={screen.dryRun}
          noBackup={flags.noBackup}
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
