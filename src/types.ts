// Shared types across the app.

export interface Skill {
  id: string; // unique within a repo (relative path)
  name: string; // directory name → becomes the /command name
  dir: string; // absolute local path to the skill directory
  description: string; // frontmatter.description, fallback to body first line
  relativePath: string; // path relative to the repo root
  installName?: string; // custom install folder name (defaults to `name`)
  source?: SkillSource;
}

export interface SkillSource {
  kind: "git" | "local";
  location: string; // credential-free URL or absolute local path
  relativePath: string;
  commit: string | null; // unknown is explicit, never inferred
}

export interface SkillFileDigest {
  path: string; // slash-separated path relative to the installed skill
  size: number;
  sha256: string;
}

export interface InstallationRecord {
  id: string;
  skillId: string;
  installName: string;
  agent: AgentId;
  targetPath: string;
  source: SkillSource;
  installedAt: string;
  updatedAt: string;
  contentHash: string;
  files: SkillFileDigest[];
}

export interface InstallManifest {
  schemaVersion: 1;
  installations: InstallationRecord[];
}

export type InventoryStatus = "managed" | "modified" | "unmanaged" | "missing" | "invalid";

export interface InventoryItem {
  status: InventoryStatus;
  agent: AgentId;
  installName: string;
  targetPath: string;
  record?: InstallationRecord;
  contentHash?: string;
  issue?: string;
}

export interface DoctorIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface DoctorReport {
  schemaVersion: 1;
  ok: boolean;
  checked: number;
  issues: DoctorIssue[];
}

export type FileChangeKind = "added" | "removed" | "modified";

export interface FileChange {
  path: string;
  kind: FileChangeKind;
  before?: SkillFileDigest;
  after?: SkillFileDigest;
}

export type UpdateStatus = "update" | "current" | "modified" | "missing" | "unavailable";

export interface UpdatePlanItem {
  record: InstallationRecord;
  status: UpdateStatus;
  currentHash?: string;
  sourceCommit?: string | null;
  changes: FileChange[];
  message?: string;
}

export type AgentId =
  | "claude"
  | "codex"
  | "cursor"
  | "zcode"
  | "openclaw"
  | "hermes"
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
  | { kind: "manager" }
  | { kind: "cloning"; url: string }
  | { kind: "skills"; repoDir: string; url: string }
  | {
      kind: "agents";
      repoDir: string;
      url: string;
      selected: string[]; // skill ids
    }
  | {
      kind: "naming";
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
