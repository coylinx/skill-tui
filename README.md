# skilltui — Skill Installer TUI

[![CI](https://github.com/coylin-zy/skill-tui/actions/workflows/ci.yml/badge.svg)](https://github.com/coylin-zy/skill-tui/actions/workflows/ci.yml)

A terminal UI for importing [Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) (`SKILL.md`) into AI coding agents from any git repository.

Enter a Skill repo's git URL, pick which skills to install, rename their install folders, choose target agents, and `skilltui` copies them into the right place — with a preview-before-write confirmation gate and automatic backups before overwrites.

## Supported agents

| Agent | Install path | Detection |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>/` | `claude` on PATH |
| Codex | `~/.codex/skills/<name>/` | `codex` on PATH |
| Cursor | `~/.cursor/skills/<name>/` | config dir |
| ZCode | `~/.zcode/skills/<name>/` | `zcode` on PATH |
| OpenClaw | `~/.openclaw/skills/<name>/` | `openclaw` on PATH |
| Hermes | `~/.hermes/skills/<name>/` | `hermes` on PATH |
| OpenCode | `~/.config/opencode/skills/<name>/` | `opencode` on PATH |

All agents share the same Skill format: a directory containing a `SKILL.md` with YAML frontmatter (`name`, `description`). The **install folder name** becomes the `/command` name — you can customize it during import.

## Install

```sh
npm install -g skill-tui
```

Then run:

```sh
skilltui
```

The TUI launches on a clean screen (alternate buffer, like vim/htop) and restores your previous terminal content on exit.

## Usage

```sh
skilltui                              # interactive: enter a git URL
skilltui https://github.com/obra/superpowers.git   # skip URL entry
skilltui --dry-run <url>              # preview what would be written, no changes
skilltui --overwrite <url>            # overwrite existing skills (backs up first)
skilltui --no-backup <url>            # overwrite without backup (confirm required)
skilltui list [--agent <id>]          # inspect managed and unmanaged Skills
skilltui doctor [--json]              # validate manifest and installed Skills
skilltui update [name] [--yes]        # preview source changes; apply explicitly
skilltui update [name] --yes --force  # apply even when the target has local edits
skilltui remove <name> [--yes]        # preview, then explicitly remove a managed Skill
skilltui --help
skilltui --version
```

在交互首页按 `m` 可打开本机 Skill 管理台：它汇总安装状态，`r` 刷新磁盘状态，`u` 扫描已记录来源的更新，`b` 打开备份恢复；发现更新后可用方向键、Space 选择目标，Enter 进入预览并执行，`f` 才允许覆盖本地改动，`Esc` 返回导入首页。管理台和命令行共用同一套预览与事务写入边界。

### Flow

1. **URL input** — enter a Skill repo's git address (↑/↓ recalls history). Launched with `skilltui <url>` to skip this step.
2. **Clone** — shallow-cloned to `~/.skill-tui/cache/<hash>/`. Cache is pruned automatically: entries older than **2 hours** are deleted on startup.
3. **Skill list** — discovered skills with descriptions. **Nothing is pre-selected** — use Space to explicitly opt in, `a` to toggle all.
4. **Naming** — rename each selected skill's install folder (the `/command` name). ↑/↓ to switch between fields, type directly to edit, Enter to confirm. Names are sanitized to `[a-z0-9-]`.
5. **Agent select** — target agents with three-state detection: ✓ installed / ⚠ configured-only / ✗ missing. **Nothing is pre-selected** — opt in with Space.
6. **Preview** — the confirmation gate: lists every target path + the new folder name + action before any write. Press `o` to toggle overwrite mode.
7. **Import** — copies with a live progress bar; overwrites are backed up first.
8. **Result** — summary. `r` or `Esc` returns to the home screen for another import; `o` opens the install dir; `b` restores a backup; `q` quits.

### Safety

- **Explicit selection**: neither skills nor agents are pre-selected — you opt in to each with Space, preventing accidental mass installs.
- **Preview-first**: nothing is written until you confirm the exact paths on the preview screen.
- **`--dry-run`**: prints the plan and exits without touching disk.
- **Backups**: overwriting a skill first copies the old directory to `~/.skill-tui/backup/<agent>/<name>/<timestamp>/`, recorded in `~/.skill-tui/backup/index.json`. Restore from the result screen with `b`.
- **Skip by default**: existing skills are left alone unless you enable overwrite.
- **Cache auto-prune**: cloned repos in `~/.skill-tui/cache/` older than 2 hours are deleted on each launch.
- **Installation manifest**: successful imports record source, commit, target, and content hashes in `~/.skill-tui/manifest.json`.
- **Read-only management**: `list` and `doctor` reconcile the manifest with agent directories; existing unmanaged Skills are reported without being claimed or changed.
- **Transactional updates**: `update` materializes the recorded source, shows added/modified/removed files, and only writes after `--yes`; local target edits require `--force`, while missing targets can be repaired from the source.
- **Explicit removal**: `remove` is preview-only unless `--yes` is supplied, and creates a backup before deleting a managed target.

### Theme

A cool graphite console palette with mint primary actions and amber status cues, plus a dual-tone block-art `SKILL TUI` title (ANSI Shadow style). Each screen exposes its position in the import flow, selected counts, and keyboard actions at a glance.

---

## For Developers

### Build from source

```sh
git clone https://github.com/coylin-zy/skill-tui.git
cd skill-tui
npm install        # install deps
npm run dev        # run via tsx (src/index.tsx)
npm test           # run vitest suite
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/index.js
npm link           # make `skilltui` available globally for testing
```

### Tech stack

- **TypeScript** (strict)
- [**Ink**](https://github.com/vadimdemedes/ink) + React 19 — TUI framework
- **gray-matter** — SKILL.md frontmatter parsing
- **tsup** — bundling to a single-file CLI

### Architecture

The app is a React state machine (Ink) that switches between 8 screens, backed by pure-logic core modules that have no UI dependencies — making the core fully testable.

```
src/
├── index.tsx              # CLI entry point (the `skilltui` command)
│                          #   arg parsing, alternate-screen, error handling
├── app.tsx                # state machine — wires screens together
├── theme.ts               # color tokens (amber-orange palette)
├── types.ts               # shared types (Skill, AgentId, Screen, ImportTask…)
│
├── components/            # screens + reusable UI
│   ├── screen-frame.tsx   #   full-screen vertical centering wrapper
│   ├── title.tsx          #   logo + subtitle
│   ├── logo.tsx           #   block-art "SKILL TUI" with gradient
│   ├── footer-hint.tsx    #   bottom keybinding bar
│   ├── url-input.tsx      #   ① Git URL input + history recall
│   ├── cloning.tsx        #   ② clone progress / error
│   ├── checkbox-list.tsx  #   reusable multi-select list
│   ├── skill-list.tsx     #   ③ skill discovery + selection
│   ├── naming.tsx         #   ④ rename install folders
│   ├── agent-select.tsx   #   ⑤ agent selection + 3-state detection
│   ├── preview.tsx        #   ⑥ confirmation gate (plan before write)
│   ├── importing.tsx      #   ⑦ concurrent copy + progress bar
│   ├── progress-bar.tsx   #   text progress bar widget
│   ├── spinner.tsx        #   spinner wrapper
│   ├── result.tsx          #   ⑧ summary + restore backup
│   └── manager.tsx         #   read-only local Skill management dashboard
│
└── core/                  # logic (no UI, fully testable)
    ├── repo.ts            #   git clone / cache / pull
    ├── cache.ts           #   2-hour cache auto-prune
    ├── discover.ts        #   find SKILL.md in a repo (3 strategies)
    ├── frontmatter.ts     #   parse SKILL.md via gray-matter
    ├── agents.ts          #   agent registry + 3-state detection
    ├── detect.ts          #   executable-on-PATH probe (which/where)
    ├── importer.ts        #   plan() + importTask() with backup
    ├── backup.ts          #   backup + restore
    ├── source.ts          #   materialize recorded local/Git sources
    ├── diff.ts            #   deterministic file-level update diff
    ├── update.ts          #   update preview and apply plan
    ├── inventory.ts       #   reconcile manifest and agent directories
    ├── doctor.ts          #   health checks for manifest and targets
    ├── history.ts         #   URL history persistence
    └── paths.ts           #   cross-platform paths (~/.skill-tui/, agent dirs)
```

### Key design decisions

- **All agents are Tier-1**: pure directory copy, no config-file wiring. Gemini CLI's `GEMINI.md` @-import turned out to be unnecessary (native discovery); this was verified during research.
- **Pre-rendered logo**: the figlet ASCII art is embedded as a string constant — no runtime font-file dependency, smaller bundle.
- **Safety-first imports and updates**: `plan()` is a pure function (no writes) that both the preview screen and `--dry-run` reuse. `importTask()` remains the only target write boundary; `update` builds a diff plan first and applies it through the same importer.
- **Three-state detection**: `installed` (exe on PATH) / `configured` (config dir exists but no exe) / `missing` (neither) — more accurate than just checking for a config directory.
- **`~/.agents/skills/`**: cross-agent alias path recognized by OpenClaw, OpenCode, and Codex. Future feature: "install once, all agents use it."

### Testing

```sh
npm test           # 75+ tests via vitest + ink-testing-library
```

Tests cover: skill discovery (3 repo layouts), frontmatter parsing, agent detection logic, importer plan/fresh/skip/overwrite/backup/restore, preview screen rendering, naming screen interaction, and a full e2e flow with a cached real repo.

## Changelog

### 0.3.2
- Fix: `--overwrite` flag now actually pre-enables overwrite mode on the preview screen (was parsed but ignored)
- Fix: cloning no longer breaks on Windows when the home path contains spaces (removed `windowsVerbatimArguments`); `git clone` also uses `--` before the URL
- Fix: Ctrl+C now quits the TUI from any screen (raw mode swallowed SIGINT)
- Added `repository` / `keywords` / `author` metadata and a `prepublishOnly` guard to package.json

### 0.3.1
- Rename bin command from `skill` to `skilltui` to avoid conflict with Linux procps-ng `skill` command

### 0.2.2
- Replaced Antigravity with OpenClaw and Hermes (7 supported agents)
- Removed Gemini CLI (discontinued by Google)

### 0.2.1
- UI polish

### 0.2.0
- Rename install folders: customize the `/command` name per skill before import
- Explicit selection: skills and agents no longer pre-selected — opt in with Space
- Clean screen on launch (alternate buffer); restores terminal on exit
- Result screen: `Esc` returns to home (was: quit)
- Cache auto-prune changed from 7 days to 2 hours
- Amber-orange theme (`#f5a623`) replacing blue
- Full-screen vertical centering on all screens
- Import preview and progress show the renamed folder, not the original

### 0.1.0
- Initial release

## License

MIT
