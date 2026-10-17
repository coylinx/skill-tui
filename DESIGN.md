---
version: alpha
name: Skill TUI
description: A keyboard-operated console for installing and managing local AI coding Skills.
colors:
  background: "#0b1020"
  panel: "#121a2b"
  panelRaised: "#18243a"
  text: "#e8eefc"
  textMuted: "#8493ad"
  textSubtle: "#52627d"
  accent: "#8bf2d2"
  accentDim: "#4cc7ae"
  accentWarm: "#ffb454"
  success: "#7ee787"
  warning: "#f2cc60"
  danger: "#ff7b72"
  border: "#2a3a55"
  borderStrong: "#3e5579"
typography:
  mono:
    fontFamily: monospace
omitted:
  - section: rounded
    reason: Ink uses terminal border glyphs, without CSS radii.
  - section: spacing
    reason: Ink spacing uses character cells and lines, without CSS length tokens.
components:
  screenFrame: {}
  title: {}
  checkboxList: {}
  footerHint: {}
---

## Overview

The reference is a toolchain console: readable paths, explicit status, and visible keyboard commands. The existing dual-tone block logo is the visual signature; operational screens prioritize selection and exact file destinations.

This is a product tool for developers using several coding Agents. The interface uses Chinese instructions and standard English tool names, paths, and flags. No geographic market is inferred from the interface language. The terminal owns fonts, character widths, scrolling, and color support; this is an Ink application rather than a browser UI.

`src/theme.ts` owns runtime tokens. The frontmatter mirrors those exact values and introduces no new palette. The mapping is `colors.<name>` → `theme.<name>` → Ink `Text`/`Box` props in shared components. Compare these keys when changing tokens. Behavioral policy is maintained in README.md (Flow and Safety) and plan.md §13; the ownership map below records the corresponding implementation.

## Colors

Graphite surfaces separate inputs and focused rows. Mint identifies primary actions and the cursor. Amber marks caution; green and red pair with status text or glyphs so color is never the only cue. Low-emphasis colors are for supplementary metadata; paths and actionable instructions remain available as text.

## Typography

Use the terminal's monospace font and CJK fallback. Bold identifies headings and the focused row; avoid adding fonts or web-style size scales. Preserve mixed Chinese/English paths in copyable text.

## Layout

`ScreenFrame` owns the common frame and alignment. `Title` owns the logo and stage marker. `CheckboxList` owns focused/selected rows; `FooterHint` owns key instructions. New source kinds reuse these screens. Put long compatibility explanations below a selection list to limit row width.

The frame uses the terminal height as a minimum and grows with longer content. Preview panels fit the available width; each target path wraps below its Skill name so long Windows and macOS paths cannot push confirmation text off the left edge.

## Elevation & Depth

Panel fills and quiet borders provide hierarchy. Do not add shadows or overlays to routine terminal workflows.

## Shapes

Use Ink round borders for fields and panels, preserving the existing character-cell spacing. No CSS geometry applies.

## Components

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | UrlInput and Naming | README Flow; plan.md §13.3 | source input / install names | url-input, naming, e2e tests |
| Table Selection | CheckboxList | README Safety: explicit selection | Skills / Agent or shared targets | agent-select, e2e tests |
| CRUD | App, Manager, core importer/update/remove/backup | README Safety; plan.md §13.6 | import / preview / confirmed mutation / restore | shared-target, transactions, manager tests |

Source loading distinguishes local reads from Git cloning; errors give a correction hint and Escape returns to the retained input. No targets are selected initially. Shared-directory compatibility is stated separately from executable detection. Selecting overlapping discovery directories gives a textual warning without changing the user's selection.

Use the existing spinner for indeterminate work. Success, failures, and restore results use persistent screen text. Escape goes to the owning screen; Ctrl+C exits through the existing cleanup path. Browser dialogs, pointer affordances, and browser scrollbars do not apply.

## Do's and Don'ts

- Keep source and target paths visible before any confirmed write.
- Reuse the same preview and transaction boundaries for local, Git, individual, and shared targets.
- Preserve existing colors and keyboard conventions for feature changes.
- Avoid marketing copy and unsupported claims that every Agent discovers the shared path.
