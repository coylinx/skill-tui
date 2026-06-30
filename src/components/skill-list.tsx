// Screen ③: skill multi-select list.
// Wraps the generic CheckboxList with skill-specific labels/descriptions
// and the standard footer hints.

import { useState } from "react";
import { CheckboxList, type CheckboxItem } from "./checkbox-list.js";
import { FooterHint, type Hint } from "./footer-hint.js";
import { ScreenFrame } from "./screen-frame.js";
import { Title } from "./title.js";
import type { Skill } from "../types.js";

const HINTS: Hint[] = [
  { key: "↑↓", label: "移动" },
  { key: "Space", label: "勾选" },
  { key: "a", label: "全选/不选" },
  { key: "Enter", label: "下一步" },
  { key: "Esc", label: "返回" },
];

interface Props {
  url: string;
  skills: Skill[];
  onConfirm: (selectedIds: string[]) => void;
  onBack?: () => void;
}

export function SkillList({ url, skills, onConfirm, onBack }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(skills.map((s) => s.id)), // default: all selected
  );

  const items: CheckboxItem[] = skills.map((s) => ({
    id: s.id,
    label: s.name,
    hint: truncate(s.description, 48),
  }));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ScreenFrame>
      <Title />
      <CheckboxList
        title={`发现 ${skills.length} 个 Skill — 来自 ${shortUrl(url)}`}
        items={items}
        selected={selected}
        onToggle={toggle}
        onConfirm={() => onConfirm([...selected])}
        onBack={onBack ?? (() => {})}
        emptyText="未发现任何 Skill（仓库内无 SKILL.md），按 Esc 返回"
      />
      <FooterHint hints={HINTS} />
    </ScreenFrame>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function shortUrl(url: string): string {
  return url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}
