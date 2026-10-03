import { useState } from "react";
import { Check, UserRound, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useDraftStore } from "@/lib/store";
import type { Employee } from "@/lib/letters/types";
import { answersFromEmployee } from "@/lib/employees";

/**
 * "Pick from your employees" affordance — shown on the HR-mode wizard's
 * employee step when the directory has any records. Selecting a row
 * populates the wizard answers with the canonical employee fields plus
 * `linkedEmployeeId` so the editor can later resolve a profile chip.
 */
export function EmployeePicker({
  answers,
  onPick,
  onClear,
}: {
  answers: Record<string, unknown>;
  onPick: (patch: Record<string, unknown>, employee: Employee) => void;
  onClear: () => void;
}) {
  const employees = useDraftStore((s) => s.employees);
  const [open, setOpen] = useState(false);

  const list = Object.values(employees).sort((a, b) => {
    // Active first, then by most-recently-updated.
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return b.updatedAt - a.updatedAt;
  });
  if (list.length === 0) return null;

  const linkedId = answers.linkedEmployeeId as string | undefined;
  const linked = linkedId ? employees[linkedId] : undefined;

  const handlePick = (emp: Employee) => {
    onPick(
      {
        ...answersFromEmployee(emp),
        workerClass: emp.workerClass ?? answers.workerClass,
      },
      emp
    );
    setOpen(false);
  };

  if (linked) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-letter-rule bg-muted/40 px-2.5 py-1.5 text-xs">
        <UserRound className="size-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0 truncate">
          From directory:{" "}
          <span className="font-medium text-foreground">{linked.legalName}</span>
          {linked.jobTitle && (
            <span className="text-muted-foreground"> · {linked.jobTitle}</span>
          )}
        </span>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="underline text-muted-foreground hover:text-foreground"
            >
              Change
            </button>
          </DropdownMenuTrigger>
          <PickerMenu list={list} linkedId={linkedId} onPick={handlePick} />
        </DropdownMenu>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear linked employee"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="text-xs">
          <UserRound className="size-3.5" />
          Pick from your employees ({list.length})
        </Button>
      </DropdownMenuTrigger>
      <PickerMenu list={list} linkedId={linkedId} onPick={handlePick} />
    </DropdownMenu>
  );
}

function PickerMenu({
  list,
  linkedId,
  onPick,
}: {
  list: Employee[];
  linkedId?: string;
  onPick: (e: Employee) => void;
}) {
  return (
    <DropdownMenuContent
      align="start"
      className="max-h-[320px] overflow-auto min-w-[260px]"
    >
      {list.map((e) => (
        <DropdownMenuItem key={e.id} onClick={() => onPick(e)}>
          <UserRound className="size-3.5 mr-2 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium truncate">{e.legalName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {[e.jobTitle, e.department].filter(Boolean).join(" · ") ||
                e.email ||
                "—"}
            </div>
          </div>
          {linkedId === e.id && <Check className="size-3.5 ml-2" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}
