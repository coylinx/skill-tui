# skill — Skill Installer TUI

A terminal UI for importing [Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) (`SKILL.md`) into AI coding agents from any git repository.

Enter a Skill repo's git URL, pick which skills to install, rename their install folders, choose target agents, and `skill` copies them into the right place — with a preview-before-write confirmation gate and automatic backups before overwrites.

## Supported agents

| Agent | Install path | Detection |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>/` | `claude` on PATH |
| Codex | `~/.codex/skills/<name>/` | `codex` on PATH |
| Cursor | `~/.cursor/skills/<name>/` | config dir |
| ZCode | `~/.zcode/skills/<name>/` | `zcode` on PATH |
| Gemini CLI | `~/.gemini/skills/<name>/` + `GEMINI.md` `@`-import | `gemini` on PATH |
| OpenCode | `~/.config/opencode/skills/<name>/` | `opencode` on PATH |

All agents share the same Skill format: a directory containing a `SKILL.md` with YAML frontmatter (`name`, `description`). The **install folder name** becomes the `/command` name in Claude Code / Codex — you can customize it during import.

## Install

```sh
npm install -g skill-tui
```

Then run:

```sh
skill
```

The TUI launches on a clean screen (alternate buffer, like vim/htop) and restores your previous terminal content on exit.

## Usage

```sh
skill                              # interactive: enter a git URL
skill https://github.com/obra/superpowers.git   # skip URL entry
skill --dry-run <url>              # preview what would be written, no changes
skill --overwrite <url>            # overwrite existing skills (backs up first)
skill --no-backup <url>            # overwrite without backup (confirm required)
skill --help
skill --version
```

### Flow

1. **URL input** — enter a Skill repo's git address (↑/↓ recalls history). Launched with `skill <url>` to skip this step.
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

### Theme

Amber-orange accent (`#f5a623`) on a dark background, with a dual-tone block-art `SKILL TUI` title (ANSI Shadow style).

## Development

```sh
npm install        # install deps
npm run dev        # run via tsx (src/index.tsx)
npm test           # run vitest suite
npm run typecheck  # tsc --noEmit
npm run build      # tsup → dist/index.js
```

### Tech stack

- **TypeScript** (strict)
- [**Ink**](https://github.com/vadimdemedes/ink) + React 19 — TUI framework
- **gray-matter** — SKILL.md frontmatter parsing
- **tsup** — bundling to a single-file CLI

### Project layout

```
src/
├── index.tsx          # CLI entry (the `skill` command)
├── app.tsx            # state machine wiring screens together
├── theme.ts           # color tokens (amber-orange)
├── types.ts           # shared types
├── components/        # screens + reusable UI
│   ├── screen-frame.tsx  # full-screen vertical centering
│   ├── title.tsx, logo.tsx, footer-hint.tsx
│   ├── url-input.tsx, cloning.tsx
│   ├── checkbox-list.tsx, skill-list.tsx
│   ├── naming.tsx        # rename install folders
│   ├── agent-select.tsx
│   ├── preview.tsx, importing.tsx, progress-bar.tsx
│   └── result.tsx
└── core/              # logic (no UI)
    ├── repo.ts        # git clone / cache
    ├── cache.ts       # 2-hour cache auto-prune
    ├── discover.ts    # find SKILL.md in a repo
    ├── frontmatter.ts # parse SKILL.md
    ├── agents.ts      # agent registry + three-state detection
    ├── detect.ts      # executable-on-PATH probe
    ├── importer.ts    # plan() + importTask() with backup
    ├── backup.ts      # backup + restore
    ├── history.ts     # URL history
    └── paths.ts       # cross-platform paths
```

## Changelog

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
- Initial release: URL input, clone, skill discovery, agent detection, preview, import with backup, result summary

## License

MIT
