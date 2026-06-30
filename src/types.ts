// Shared types across the app.

export interface Skill {
  id: string; // unique within a repo (relative path)
  name: string; // directory name → becomes the /command name
  dir: string; // absolute local path to the skill directory
  description: string; // frontmatter.description, fallback to body first line
  relativePath: string; // path relative to the repo root
}

export type AgentId =
  | "claude"
  | "codex"
  | "cursor"
  | "zcode"
  | "gemini"
  | "opencode";

export type AgentStatus = "installed" | "configured" | "missing";

export type OverwriteMode = "skip" | "overwrite" | "rename";

export interface ImportTask {
  skill: Skill;
  agent: AgentId;
}

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface ImportOptions {
  overwrite: boolean;
  noBackup: boolean;
}

export interface PlanItem {
  skill: Skill;
  agent: AgentId;
  targetPath: string;
  exists: boolean; // target dir already present
  action: OverwriteMode; // planned disposition
  backupPath?: string; // set when overwrite + backup enabled
}

export interface ImportResult {
  status: TaskStatus;
  targetPath: string;
  action: OverwriteMode;
  backupPath?: string;
  message?: string; // failure / skip reason
}

// App-level screen state (the state machine in app.tsx).
export type Screen =
  | { kind: "url" }
  | { kind: "cloning"; url: string }
  | { kind: "skills"; repoDir: string; url: string }
  | {
      kind: "agents";
      repoDir: string;
      url: string;
      selected: string[]; // skill ids
    }
  | {
      kind: "preview";
      tasks: ImportTask[];
      overwrite: boolean;
      dryRun: boolean;
    }
  | {
      kind: "importing";
      tasks: ImportTask[];
      overwrite: boolean;
    }
  | { kind: "result"; summary: ImportSummary };

export interface ImportSummary {
  results: ImportResult[];
  url: string;
}
