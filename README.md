# skill — Skill Installer TUI

A terminal UI for importing [Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) (`SKILL.md`) into AI coding agents from any git repository.

Enter a Skill repo's git URL, pick which skills to install and which agents to target, and `skill` copies them into the right place — with a preview-before-write confirmation gate and automatic backups before overwrites.

## Supported agents

| Agent | Install path | Detection |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>/` | `claude` on PATH |
| Codex | `~/.codex/skills/<name>/` | `codex` on PATH |
| Cursor | `~/.cursor/skills/<name>/` | config dir |
| ZCode | `~/.zcode/skills/<name>/` | `zcode` on PATH |
| Gemini CLI | `~/.gemini/skills/<name>/` + `GEMINI.md` `@`-import | `gemini` on PATH |
| OpenCode | `~/.config/opencode/skills/<name>/` | `opencode` on PATH |

All agents share the same Skill format: a directory containing a `SKILL.md` with YAML frontmatter (`name`, `description`). The **directory name** becomes the `/command` name in Claude Code / Codex.

## Install

```sh
npm install -g skill-tui
```

Then run:

```sh
skill
```

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

1. **URL input** — enter a Skill repo's git address (↑/↓ recalls history).
2. **Clone** — shallow-cloned to `~/.skill-tui/cache/<hash>/` (cached on reuse).
3. **Skill list** — discovered skills with descriptions; multi-select (Space), toggle-all (a).
4. **Agent select** — target agents with three-state detection: ✓ installed / ⚠ configured-only / ✗ missing.
5. **Preview** — the confirmation gate: lists every target path + action before any write. Press `o` to toggle overwrite mode.
6. **Import** — copies with a live progress bar; overwrites are backed up first.
7. **Result** — summary with `r` re-import, `o` open dir, `b` restore a backup, `q` quit.

### Safety

- **Preview-first**: nothing is written until you confirm the exact paths on the preview screen.
- **`--dry-run`**: prints the plan and exits without touching disk.
- **Backups**: overwriting a skill first copies the old directory to `~/.skill-tui/backup/<agent>/<name>/<timestamp>/`, recorded in `~/.skill-tui/backup/index.json`. Restore from the result screen with `b`.
- **Skip by default**: existing skills are left alone unless you enable overwrite.

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
- [**Ink**](https://github.com/vadimdemedes/ink) + React — TUI framework
- **figlet** (ANSI Shadow) — block-art title
- **gray-matter** — SKILL.md frontmatter parsing
- **tsup** — bundling to a single-file CLI

### Project layout

```
src/
├── index.tsx          # CLI entry (the `skill` command)
├── app.tsx            # state machine wiring screens together
├── theme.ts           # color tokens
├── types.ts           # shared types
├── components/        # screens + reusable UI
│   ├── title.tsx, logo.tsx, footer-hint.tsx
│   ├── url-input.tsx, cloning.tsx
│   ├── checkbox-list.tsx, skill-list.tsx, agent-select.tsx
│   ├── preview.tsx, importing.tsx, progress-bar.tsx
│   └── result.tsx
└── core/              # logic (no UI)
    ├── repo.ts        # git clone / cache
    ├── discover.ts    # find SKILL.md in a repo
    ├── frontmatter.ts # parse SKILL.md
    ├── agents.ts      # agent registry + three-state detection
    ├── detect.ts      # executable-on-PATH probe
    ├── importer.ts    # plan() + importTask() with backup
    ├── backup.ts      # backup + restore
    ├── history.ts     # URL history
    └── paths.ts       # cross-platform paths
```

## License

MIT
