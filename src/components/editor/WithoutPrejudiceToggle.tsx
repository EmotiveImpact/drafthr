import type { Draft } from "@/lib/letters/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/**
 * Toggle between OPEN and "Without Prejudice and Subject to Contract" modes.
 * Only rendered for employee-mode drafts.
 */
export function WithoutPrejudiceToggle({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (value: boolean) => void;
}) {
  if (draft.mode !== "employee") return null;
  const value = Boolean(draft.context.withoutPrejudice);
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-letter-rule px-2 py-1 text-xs">
      <Switch id="wp-toggle" checked={value} onCheckedChange={onChange} />
      <Label htmlFor="wp-toggle" className="font-medium cursor-pointer">
        Without Prejudice
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-3 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          When ON, the letter is marked "Without Prejudice and Subject to Contract" —
          settlement-position language is permissible and inadmissible at tribunal
          (s.111A ERA 1996, with caveats). Send only as a discrete settlement
          communication; do not paste into open correspondence.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
