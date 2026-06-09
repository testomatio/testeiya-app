"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSkillsService } from "@/lib/services/StoreProvider";
import { observer } from "mobx-react-lite";
import { ChevronDownIcon, SparklesIcon } from "@/lib/icons";

export const SkillsMenu = observer(function SkillsMenu({
  onInsert,
  disabled,
}: {
  onInsert: (name: string) => void;
  disabled?: boolean;
}) {
  const skillsService = useSkillsService();

  return (
    <DropdownMenu onOpenChange={(open) => open && skillsService.load()}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="shrink-0 cursor-pointer gap-1 rounded-full px-4"
          />
        }
      >
        <SparklesIcon className="size-3.5" />
        Skills
        <ChevronDownIcon className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuLabel>Insert a skill</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {skillsService.skills.length === 0 && (
          <div className="px-2 py-1.5 text-muted-foreground text-xs">
            {skillsService.loading ? "Loading…" : "No skills available"}
          </div>
        )}
        {skillsService.skills.map((skill) => (
          <DropdownMenuItem
            key={skill.name}
            onClick={() => onInsert(skill.name)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="font-medium">{skill.name}</span>
            <span className="line-clamp-2 text-muted-foreground text-xs">
              {skill.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
