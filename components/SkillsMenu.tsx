"use client";

import { useMemo, useState } from "react";
import { InputGroupButton } from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useSkillsService } from "@/lib/services/StoreProvider";
import type { SkillInfo } from "@/lib/services/types";
import { Icon, SearchIcon, XIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { observer } from "mobx-react-lite";

const ALL_CATEGORY = "All";

export const SkillsMenu = observer(function SkillsMenu({
  onInsert,
  disabled,
}: {
  onInsert: (name: string) => void;
  disabled?: boolean;
}) {
  const skillsService = useSkillsService();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);

  const groups = useMemo(
    () => groupByCategory(skillsService.skills),
    [skillsService.skills]
  );

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    const entries = [
      { category: ALL_CATEGORY, count: countMatches(skillsService.skills, q) },
    ];
    for (const group of groups) {
      entries.push({ category: group.category, count: countMatches(group.skills, q) });
    }
    return entries;
  }, [groups, skillsService.skills, query]);

  const activeSkills = useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return skillsService.skills;
    return groups.find((g) => g.category === activeCategory)?.skills ?? skillsService.skills;
  }, [groups, skillsService.skills, activeCategory]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeSkills;
    return activeSkills.filter((s) => matchesQuery(s, q));
  }, [activeSkills, query]);

  const insert = (name: string) => {
    onInsert(name);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <InputGroupButton
            aria-label="Insert a skill"
            disabled={disabled}
            size="sm"
          />
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M18.6533 3.86523C19.1585 3.86524 19.5865 4.04063 19.9365 4.39062C20.2862 4.74052 20.4609 5.16794 20.4609 5.67285V19.0576C20.4609 19.5625 20.2862 19.99 19.9365 20.3398C19.5865 20.6898 19.1585 20.8652 18.6533 20.8652H5.26855C4.7635 20.8652 4.33627 20.6898 3.98633 20.3398C3.63639 19.9899 3.46098 19.5627 3.46094 19.0576V5.67285C3.46095 5.16776 3.63641 4.74059 3.98633 4.39062C4.33627 4.04068 4.7635 3.86529 5.26855 3.86523H18.6533ZM5.26855 5.36523C5.19181 5.3653 5.12144 5.39711 5.05762 5.46094C4.99347 5.52492 4.96096 5.59588 4.96094 5.67285V19.0576C4.96099 19.1345 4.99352 19.2046 5.05762 19.2686C5.12155 19.3327 5.19165 19.3652 5.26855 19.3652H18.6533C18.7303 19.3652 18.8012 19.3327 18.8652 19.2686C18.9291 19.2047 18.9609 19.1344 18.9609 19.0576V5.67285C18.9609 5.59588 18.9294 5.52492 18.8652 5.46094C18.8012 5.39679 18.7303 5.36524 18.6533 5.36523H5.26855ZM15.498 7.48633L9.67578 17.8887L8.46094 17.209L14.2832 6.80664L15.498 7.48633Z" fill="currentColor"/>
        </svg>
        Skills
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[32rem] gap-0 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills"
              className="h-8 pl-7 pr-7"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex min-h-0">
          <div className="max-h-72 w-40 shrink-0 overflow-y-auto border-r p-1">
            {categories.map((cat) => (
              <button
                key={cat.category}
                type="button"
                onClick={() => setActiveCategory(cat.category)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  cat.category === activeCategory && "bg-accent text-accent-foreground",
                  cat.count === 0 && "text-muted-foreground"
                )}
              >
                <span className="truncate">{cat.category}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {cat.count}
                </span>
              </button>
            ))}
          </div>
          <div className="max-h-72 min-w-0 flex-1 overflow-y-auto p-1">
            {skillsService.skills.length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-xs">
                {skillsService.loading ? "Loading…" : "No skills available"}
              </div>
            )}
            {skillsService.skills.length > 0 && filtered.length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-xs">
                No skills match “{query.trim()}”
              </div>
            )}
            {filtered.map((skill) => (
              <button
                key={skill.name}
                type="button"
                onClick={() => insert(skill.name)}
                className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="truncate font-medium text-sm">{skill.name}</span>
                  {skill.source === "custom" && (
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      custom
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-muted-foreground text-xs">
                  {skill.description}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 border-t p-1">
          <button
            type="button"
            onClick={() => {
              void skillsService.openFolder();
              setOpen(false);
            }}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Icon name="folder_open" className="size-4" />
            Open skills folder
          </button>
          <button
            type="button"
            onClick={() => void skillsService.refresh()}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Icon
              name="refresh"
              className={cn("size-4", skillsService.loading && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setQuery("");
    setActiveCategory(ALL_CATEGORY);
    void skillsService.load();
  }
});

function groupByCategory(skills: SkillInfo[]): { category: string; skills: SkillInfo[] }[] {
  const order: string[] = [];
  const byCategory = new Map<string, SkillInfo[]>();
  for (const skill of skills) {
    const category = skill.category || "Other";
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
      order.push(category);
    }
    byCategory.get(category)!.push(skill);
  }
  order.sort((a, b) => categoryRank(a) - categoryRank(b));
  return order.map((category) => ({ category, skills: byCategory.get(category)! }));
}

function categoryRank(category: string): number {
  if (category === "Custom") return 2;
  if (category === "Other") return 1;
  return 0;
}

function countMatches(skills: SkillInfo[], query: string): number {
  if (!query) return skills.length;
  return skills.filter((s) => matchesQuery(s, query)).length;
}

function matchesQuery(skill: SkillInfo, query: string): boolean {
  return (
    skill.name.toLowerCase().includes(query) ||
    (skill.description?.toLowerCase().includes(query) ?? false)
  );
}
