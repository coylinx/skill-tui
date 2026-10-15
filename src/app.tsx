// Top-level app state machine. Each screen owns its back navigation.

import { useInput } from "ink";
import { useEffect, useRef, useState } from "react";
import path from "node:path";
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

export function App({ initialUrl, flags }: { initialUrl?: string; flags: AppFlags }) {
  const [screen, setScreen] = useState<Screen>(() =>
    initialUrl?.trim() ? { kind: "cloning", url: initialUrl.trim() } : { kind: "url" },
  );
  const [history, setHistory] = useState<string[]>([]);
  const [cloneError, setCloneError] = useState<string | undefined>();
  const [cloneCachePath, setCloneCachePath] = useState<string>("");
  const [skills, setSkills] = useState<Skill[]>([]);
  // Skills after optional renaming (installName set). Used when building
  // import tasks so the target folder reflects the user's chosen name.
  const [renamedSkills, setRenamedSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<AgentId[]>([]);
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
    let alive = true;
    setCloneError(undefined);
    setCloneCachePath("");
    urlHash(screen.url).then((h) => {
      if (alive) setCloneCachePath(path.join(cacheDir, h));
    });
    cloneRepo(screen.url, { signal: controller.signal })
      .then(async (res) => {
        if (!alive) return;
        const found = discoverSkills(res.dir);
        await saveHistory(screen.url);
        const updatedHistory = await loadHistory();
        if (!alive) return;
        setHistory(updatedHistory);
        setSkills(found);
        setRenamedSkills([]);
        setSelectedSkillIds([]);
        setSelectedAgentIds([]);
        skillsCtx.current = { repoDir: res.dir, url: screen.url };
        setScreen({ kind: "skills", repoDir: res.dir, url: screen.url });
      })
      .catch((err: unknown) => {
        if (alive) setCloneError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [screen]);

  // Other screens handle Esc locally; importing cannot be interrupted by Esc.
  useInput((_input, key) => {
    if (key.escape && screen.kind === "cloning") {
      setScreen({ kind: "url" });
    }
  });

  switch (screen.kind) {
    case "url":
      return (
        <UrlInput
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
          initialSelected={selectedSkillIds}
          onBack={() => setScreen({ kind: "url" })}
          onConfirm={(selectedIds) => {
            setSelectedSkillIds(selectedIds);
            setScreen({
              kind: "naming",
              repoDir: screen.repoDir,
              url: screen.url,
              selected: selectedIds,
            });
          }}
        />
      );

    case "naming": {
      const selectedSkills = screen.selected
        .map((id) => renamedSkills.find((s) => s.id === id) ?? skills.find((s) => s.id === id))
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
          initialSelected={selectedAgentIds}
          onConfirm={(agentIds) => {
            setSelectedAgentIds(agentIds);
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
