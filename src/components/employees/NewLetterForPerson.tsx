import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Employee, LetterTypeId } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { prefillsFromProfile, useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { employeeAnswers } from "./model";

const QUICK: LetterTypeId[] = ["warning", "probation_outcome", "return_to_work", "salary_increase", "promotion", "termination", "contract_amendment", "reference"];

/**
 * "New letter" for one person: the common HR letter types; picking one
 * creates the letter with this person's details already filled in and opens
 * it. The template library holds every other type.
 */
export function NewLetterForPerson({ employee, open, onOpenChange }: { employee: Employee | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const createDraft = useDraftStore((s) => s.createDraft);
  const types = QUICK.flatMap((id) => {
    try {
      const m = getLetterMeta(id);
      return m.mode === "employer" ? [{ id, label: m.shortTitle }] : [];
    } catch {
      return [];
    }
  });
  const start = (type: LetterTypeId) => {
    if (!employee) return;
    const id = createDraft(type, { ...prefillsFromProfile(profile, "employer"), ...employeeAnswers(employee) }, "employer");
    onOpenChange(false);
    nav(`/editor/${id}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New letter{employee ? ` for ${employee.preferredName || employee.legalName}` : ""}</DialogTitle>
          <DialogDescription>Pick a letter type. It opens with their name, job title and department already filled in.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <Button key={t.id} variant="outline" size="sm" onClick={() => start(t.id)}>
              <Plus />
              {t.label}
            </Button>
          ))}
        </div>
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">
          Or browse the full{" "}
          <Link to="/hr/new" onClick={() => onOpenChange(false)} className="font-medium text-[var(--ds-ink)] underline underline-offset-2">
            template library
          </Link>
          .
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
