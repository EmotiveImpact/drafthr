import type { Employee, EmploymentStatus } from "@/lib/letters/types";
import { Pill } from "@/components/ds";
import { ConfirmDialog } from "@/components/letters/dialogs";
import { STATUS_LABEL, STATUS_TONE } from "./model";

export function EmployeeStatusPill({ status }: { status: EmploymentStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

/** In-app confirmation before deleting a person's record. */
export function DeleteEmployeeDialog({
  employee,
  open,
  onOpenChange,
  onConfirm,
}: {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? `Delete ${employee.legalName}?` : "Delete this person?"}
      body="This removes the employee record permanently. Their letters stay, but they'll be unlinked from any matters. To keep the record, use Archive instead."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
    />
  );
}
