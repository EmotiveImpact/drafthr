import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  Employee,
  EmploymentStatus,
  WorkerClass,
} from "@/lib/letters/types";

export type EmployeeFormValues = Omit<Employee, "id" | "createdAt" | "updatedAt">;

const STATUS_OPTIONS: { value: EmploymentStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "notice", label: "Notice" },
  { value: "on-leave", label: "On leave" },
  { value: "left", label: "Left" },
];

const WORKER_CLASS_OPTIONS: { value: WorkerClass; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "worker", label: "Worker" },
  { value: "contractor", label: "Contractor" },
  { value: "casual", label: "Casual" },
];

const EMPTY: EmployeeFormValues = {
  legalName: "",
  preferredName: undefined,
  jobTitle: undefined,
  department: undefined,
  email: undefined,
  startDate: undefined,
  workerClass: "employee",
  status: "active",
};

/**
 * Modal form used to create a new Employee record or edit an existing
 * one. Validation is intentionally light — legalName is the only
 * required field; everything else is optional and editable later.
 */
export function EmployeeForm({
  open,
  onOpenChange,
  initial,
  title,
  description,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial?: Partial<EmployeeFormValues>;
  title: string;
  description?: string;
  submitLabel: string;
  onSubmit: (values: EmployeeFormValues) => void;
}) {
  const [values, setValues] = useState<EmployeeFormValues>({ ...EMPTY, ...initial });

  // Reset the form only on the closed→open transition so each invocation is
  // fresh. Callers often build `initial` as a new object literal every render
  // (e.g. EmployeeDetail), so keying the reset on `initial`'s identity would
  // re-fire on any parent re-render and silently wipe in-progress edits.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setValues({ ...EMPTY, ...initial });
    wasOpen.current = open;
  }, [open, initial]);

  const canSubmit = values.legalName.trim().length > 0;

  function patch<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="emp-legal-name">Legal name *</Label>
            <Input
              id="emp-legal-name"
              value={values.legalName}
              onChange={(e) => patch("legalName", e.target.value)}
              placeholder="Jane Patel"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-preferred">Preferred name</Label>
              <Input
                id="emp-preferred"
                value={values.preferredName ?? ""}
                onChange={(e) => patch("preferredName", e.target.value || undefined)}
                placeholder="Jane"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-email">Email</Label>
              <Input
                id="emp-email"
                type="email"
                value={values.email ?? ""}
                onChange={(e) => patch("email", e.target.value || undefined)}
                placeholder="jane@acme.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-job-title">Job title</Label>
              <Input
                id="emp-job-title"
                value={values.jobTitle ?? ""}
                onChange={(e) => patch("jobTitle", e.target.value || undefined)}
                placeholder="Senior Engineer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-department">Department</Label>
              <Input
                id="emp-department"
                value={values.department ?? ""}
                onChange={(e) => patch("department", e.target.value || undefined)}
                placeholder="Platform"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-start-date">Start date</Label>
              <Input
                id="emp-start-date"
                type="date"
                value={values.startDate ?? ""}
                onChange={(e) => patch("startDate", e.target.value || undefined)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-worker-class">Worker class</Label>
              <Select
                value={values.workerClass ?? "employee"}
                onValueChange={(v) => patch("workerClass", v as WorkerClass)}
              >
                <SelectTrigger id="emp-worker-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKER_CLASS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="emp-status">Status</Label>
            <Select
              value={values.status}
              onValueChange={(v) => patch("status", v as EmploymentStatus)}
            >
              <SelectTrigger id="emp-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                ...values,
                legalName: values.legalName.trim().replace(/\s+/g, " "),
                preferredName: values.preferredName?.trim() || undefined,
                jobTitle: values.jobTitle?.trim() || undefined,
                department: values.department?.trim() || undefined,
                email: values.email?.trim() || undefined,
                startDate: values.startDate || undefined,
              })
            }
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
