// Discover skills inside a cloned repo.
// Priority:
//   1. skills/<name>/SKILL.md        — multi-skill repo (e.g. superpowers)
//   2. <root>/SKILL.md                — single-skill repo (repo IS the skill)
//   3. recursive **/SKILL.md          — fallback for unusual layouts
// Each discovered skill keeps a stable id (its path relative to the repo root).

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Skill } from "../types.js";
import { parseSkillFile } from "./frontmatter.js";

const SKILL_FILE = "SKILL.md";

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isSkillDir(p: string): boolean {
  return isDir(p) && existsSync(path.join(p, SKILL_FILE));
}

function rel(root: string, abs: string): string {
  return path.relative(root, abs).replace(/\\/g, "/");
}

function makeSkill(root: string, skillDir: string): Skill {
  const file = path.join(skillDir, SKILL_FILE);
  const parsed = parseSkillFile(file);
  const name = path.basename(skillDir);
  return {
    id: rel(root, skillDir),
    name,
    dir: skillDir,
    description: parsed.description || name,
    relativePath: rel(root, skillDir),
  };
}

/** Scan skills/<name>/SKILL.md — the common multi-skill layout. */
function fromSkillsDir(root: string): Skill[] {
  const skillsRoot = path.join(root, "skills");
  if (!isDir(skillsRoot)) return [];
  const out: Skill[] = [];
  for (const entry of readdirSync(skillsRoot)) {
    const child = path.join(skillsRoot, entry);
    if (isSkillDir(child)) out.push(makeSkill(root, child));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A single-skill repo: root itself contains SKILL.md. */
function fromRoot(root: string): Skill[] | null {
  const file = path.join(root, SKILL_FILE);
  if (!existsSync(file)) return null;
  // Cache directories are URL hashes; prefer the declared skill name.
  const parsed = parseSkillFile(file);
  const name = parsed.name;
  return [
    {
      id: name,
      name,
      dir: root,
      description: parsed.description || name,
      relativePath: ".",
    },
  ];
}

/** Recursive fallback: any SKILL.md anywhere under root. */
function fromRecursive(root: string): Skill[] {
  const out: Skill[] = [];
  const skip = new Set([".git", "node_modules", ".skill-tui"]);
  function walk(dir: string, depth: number) {
    if (depth > 6) return; // safety bound
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry)) continue;
      const child = path.join(dir, entry);
      if (isDir(child)) {
        if (existsSync(path.join(child, SKILL_FILE))) {
          out.push(makeSkill(root, child));
        } else {
          walk(child, depth + 1);
        }
      }
    }
  }
  walk(root, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function discoverSkills(repoDir: string): Skill[] {
  const fromSkills = fromSkillsDir(repoDir);
  if (fromSkills.length > 0) return fromSkills;

  const fromRootSkills = fromRoot(repoDir);
  if (fromRootSkills) return fromRootSkills;

  return fromRecursive(repoDir);
}
