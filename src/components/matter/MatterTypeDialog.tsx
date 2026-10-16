import { useEffect, useState } from "react";
import type { MatterType } from "@/lib/letters/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMenuReturnFocus } from "@/components/letters/dialogs";
import { KitSelect } from "./KitSelect";
import { MATTER_TYPES, MATTER_TYPE_LABEL } from "./model";

/**
 * "Set type" from the matter's options: the same optional type New matter
 * offers, for a matter made without one (promoted from letters, or created
 * before the field existed), so its Type column and filter can be filled.
 * "Not set" clears it again; nothing is ever guessed.
 */
export function MatterTypeDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: MatterType;
  onSave: (type: MatterType | undefined) => void;
}) {
  const [type, setType] = useState<MatterType | "">(value ?? "");
  const returnFocus = useMenuReturnFocus(open);
  useEffect(() => {
    if (open) setType(value ?? "");
  }, [open, value]);
  const changed = (type || undefined) !== value;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Matter type</DialogTitle>
          <DialogDescription>Shown in the Matters list and used by its Type filter.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!changed) return;
            onSave(type || undefined);
            onOpenChange(false);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="matter-type-edit">Type</Label>
            <KitSelect
              id="matter-type-edit"
              value={type}
              onChange={(v) => setType(v as MatterType | "")}
              emptyLabel="Not set"
              options={MATTER_TYPES.map((t) => ({ value: t, label: MATTER_TYPE_LABEL[t] }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!changed}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
