# skilltui — Skill Installer TUI

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

Requires **Node.js 22+** and **Git**. Interactive mode needs a terminal (TTY);
`--help` and `--version` also work when piped or redirected.

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
skilltui --help
skilltui --version
```

### Flow

1. **URL input** — enter a Skill repo's git address (↑/↓ recalls history). Launched with `skilltui <url>` to skip this step.
2. **Clone** — shallow-cloned to `~/.skill-tui/cache/<hash>/`. Cache is pruned automatically: entries older than **2 hours** are deleted on startup.
3. **Skill list** — discovered skills with descriptions. **Nothing is pre-selected** — use Space to explicitly opt in, `a` to toggle all.
4. **Naming** — rename each selected skill's install folder (the `/command` name). ↑/↓ to switch between fields, type directly to edit, Enter to confirm. Names are sanitized to `[a-z0-9-]`; empty or duplicate names must be corrected before continuing.
5. **Agent select** — target agents with three-state detection: ✓ installed / ⚠ configured-only / ✗ missing. **Nothing is pre-selected** — opt in with Space.
6. **Preview** — the confirmation gate: lists every target path + the new folder name + action before any write. Press `o` to toggle overwrite mode.
7. **Import** — copies with a live progress bar; overwrites are backed up first.
8. **Result** — summary. `r` or `Esc` returns to the home screen for another import; `o` opens the install dir; `b` restores a backup; `q` quits.

Esc returns one screen at a time and retains confirmed selections and names.
During cloning, Esc cancels the Git operation and returns home. Imports finish
before returning to the result screen.

### Safety

- **Explicit selection**: neither skills nor agents are pre-selected — you opt in to each with Space, preventing accidental mass installs.
- **Preview-first**: nothing is written until you confirm the exact paths on the preview screen.
- **`--dry-run`**: prints the plan after restoring your terminal and exits without installing or overwriting skills. Repository cache and URL history may still be updated.
- **Backups**: overwriting a skill first copies the old directory to `~/.skill-tui/backup/<agent>/<name>/<timestamp>/`, recorded in `~/.skill-tui/backup/index.json`. Restore from the result screen with `b`.
- **Skip by default**: existing skills are left alone unless you enable overwrite.
- **Validated replacement**: imports are copied and validated in a temporary directory before replacing the target. Failed copies leave the previous install intact; failed replacements roll back. Backups use unique folders, including for repeated overwrites in the same second.
- **Cache auto-prune**: cloned repos in `~/.skill-tui/cache/` older than 2 hours are deleted on each launch.

### Theme

Amber-orange accent (`#f5a623`) on a dark background, with a dual-tone block-art `SKILL TUI` title (ANSI Shadow style).

---

## For Developers

### Build from source

```sh
git clone https://github.com/coylinx/skill-tui.git
cd skill-tui
npm install        # install deps
npm run dev        # run via tsx (src/index.tsx)
npm test           # run vitest suite
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/index.js
npm run test:terminal # build + real PTY flow (Linux/macOS, Python 3 required)
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
│   └── result.tsx         #   ⑧ summary + restore backup
│
└── core/                  # logic (no UI, fully testable)
    ├── repo.ts            #   git clone / cache / pull
    ├── cache.ts           #   2-hour cache auto-prune
    ├── discover.ts        #   find SKILL.md in a repo (3 strategies)
    ├── frontmatter.ts     #   parse SKILL.md via gray-matter
    ├── agents.ts          #   agent registry + 3-state detection
    ├── detect.ts          #   executable-on-PATH probe (which/where)
    ├── importer.ts        #   plan() + importTask() with backup
    ├── directory.ts       #   staged directory replacement + rollback
    ├── backup.ts          #   backup + restore
    ├── history.ts         #   URL history persistence
    └── paths.ts           #   cross-platform paths (~/.skill-tui/, agent dirs)
```

### Key design decisions

- **All agents are Tier-1**: pure directory copy, no config-file wiring. Gemini CLI's `GEMINI.md` @-import turned out to be unnecessary (native discovery); this was verified during research.
- **Pre-rendered logo**: the figlet ASCII art is embedded as a string constant — no runtime font-file dependency, smaller bundle.
- **Safety-first imports**: `plan()` is a pure function (no writes) that both the preview screen and `--dry-run` reuse. `importTask()` only runs after explicit confirmation.
- **Three-state detection**: `installed` (exe on PATH) / `configured` (config dir exists but no exe) / `missing` (neither) — more accurate than just checking for a config directory.
- **`~/.agents/skills/`**: cross-agent alias path recognized by OpenClaw, OpenCode, and Codex. Future feature: "install once, all agents use it."

### Testing

```sh
npm test           # unit + offline integration tests via vitest + ink-testing-library
npm run test:terminal # actual keyboard input and screen restoration in a PTY
```

Tests cover skill discovery, env-aware agent paths, importer planning and rollback,
backup and restore, duplicate names, URL history navigation, CLI arguments, and
the full app flow using a disposable local Git repository. Test installs and
backups use temporary home directories, without changing your real agent data.

CI runs typecheck, tests, build, and CLI smoke checks on Linux, macOS, and Windows
with Node 22 and 24. Linux also drives the built CLI through a real PTY, checking
dry-run output, overwrite/backup/restore, returning home, Ctrl+C, and SIGTERM.

## Changelog

### Unreleased
- Fix `--overwrite` being ignored and correct the no-backup preview label
- Preserve confirmed selections and names when navigating back; returning home no longer restarts the initial URL
- Cancel Git on leaving the clone screen and ignore stale async results
- Stage and validate imports before replacing existing installs, with rollback on failure
- Keep separate backups for rapid overwrites and stage backup restoration
- Reject empty/duplicate install names and invalid target paths
- Recall URL history newest-first and restore the draft when returning down
- Keep dry-run plans visible after restoring the terminal; handle Ctrl+C, SIGTERM, invalid CLI arguments, and missing TTYs
- Use declared frontmatter names for single-skill repositories cached under URL hashes
- Require Node 22+ to match Ink 7; test Node 22/24 and real Linux PTY flows

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
