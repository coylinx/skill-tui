// Parse SKILL.md frontmatter via gray-matter.
// name falls back to the directory name; description falls back to the
// first non-empty line of the body.

import { readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

export function parseSkillFile(filePath: string): ParsedSkill {
  const raw = readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);

  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : path.basename(path.dirname(filePath));

  let description =
    typeof data.description === "string" && data.description.trim()
      ? data.description.trim()
      : "";

  if (!description) {
    // Fall back to the first non-empty, non-heading line of the body.
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) {
        description = t;
        break;
      }
    }
  }

  return { name, description, body: content };
}
