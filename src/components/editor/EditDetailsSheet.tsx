import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Settings2, X } from "lucide-react";
import type { Draft, EmployeeTone, Tone, UkRegion, UsState, WorkerClass } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

const TONES: { value: Tone; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "neutral", label: "Neutral" },
  { value: "formal", label: "Formal" },
  { value: "firm", label: "Firm" },
];

const EMPLOYEE_TONES: { value: EmployeeTone; label: string }[] = [
  { value: "conciliatory", label: "Conciliatory" },
  { value: "assertive", label: "Assertive" },
  { value: "forensic", label: "Forensic" },
  { value: "tribunal_ready", label: "Tribunal-ready" },
];

const UK_REGIONS: UkRegion[] = ["England & Wales", "Scotland", "Northern Ireland"];
const WORKER_CLASSES: { value: WorkerClass; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "worker", label: "Worker (UK)" },
  { value: "contractor", label: "Contractor / 1099" },
  { value: "casual", label: "Casual / zero-hours" },
];

/**
 * Side-sheet for editing the wizard answers without leaving the editor.
 * Surfaces the fields most likely to change after draft creation:
 * jurisdiction, region/state, worker class, tone, dates, recipient
 * details. Save patches the draft via patchDraft().
 *
 * Section content is NOT regenerated automatically — the user can hit
 * "Regenerate all" or refine specific sections from the AI panel after
 * saving. This is intentional: most edits are typo fixes and shouldn't
 * blow away the user's drafted text.
 */
export function EditDetailsSheet({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  draft: Draft;
}) {
  const patchDraft = useDraftStore((s) => s.patchDraft);

  // Local form state — committed to the store on Save.
  const [jurisdiction, setJurisdiction] = useState(draft.context.jurisdiction);
  const [ukRegion, setUkRegion] = useState<UkRegion | undefined>(draft.context.ukRegion);
  const [usState, setUsState] = useState<UsState | undefined>(draft.context.usState);
  const [workerClass, setWorkerClass] = useState<WorkerClass>(draft.context.workerClass);
  const [tone, setTone] = useState<Tone>(draft.context.tone);
  const [employeeTone, setEmployeeTone] = useState<EmployeeTone>(
    draft.context.employeeTone ?? "assertive"
  );
  const [effectiveDate, setEffectiveDate] = useState(draft.context.effectiveDate);
  const [issueDate, setIssueDate] = useState(draft.context.issueDate);
  const [employerName, setEmployerName] = useState(draft.employer.legalName);
  const [employerAddress, setEmployerAddress] = useState(draft.employer.address);
  const [employeeName, setEmployeeName] = useState(draft.employee.legalName);
  const [employeeJobTitle, setEmployeeJobTitle] = useState(draft.employee.jobTitle);
  const [employeeAddress, setEmployeeAddress] = useState(draft.employee.address);
  const [employeeStartDate, setEmployeeStartDate] = useState(draft.employee.startDate);

  // Re-sync if a different draft is opened or upstream values change.
  useEffect(() => {
    if (!open) return;
    setJurisdiction(draft.context.jurisdiction);
    setUkRegion(draft.context.ukRegion);
    setUsState(draft.context.usState);
    setWorkerClass(draft.context.workerClass);
    setTone(draft.context.tone);
    setEmployeeTone(draft.context.employeeTone ?? "assertive");
    setEffectiveDate(draft.context.effectiveDate);
    setIssueDate(draft.context.issueDate);
    setEmployerName(draft.employer.legalName);
    setEmployerAddress(draft.employer.address);
    setEmployeeName(draft.employee.legalName);
    setEmployeeJobTitle(draft.employee.jobTitle);
    setEmployeeAddress(draft.employee.address);
    setEmployeeStartDate(draft.employee.startDate);
  }, [open, draft]);

  const isEmployer = draft.mode === "employer";

  const onSave = () => {
    patchDraft(draft.id, {
      context: {
        jurisdiction,
        ukRegion: jurisdiction === "UK" ? ukRegion : undefined,
        usState: jurisdiction === "US" ? usState : undefined,
        workerClass,
        tone,
        employeeTone: !isEmployer ? employeeTone : draft.context.employeeTone,
        effectiveDate,
        issueDate,
      },
      employer: {
        legalName: employerName,
        address: employerAddress,
      },
      employee: {
        legalName: employeeName,
        jobTitle: employeeJobTitle,
        address: employeeAddress,
        startDate: employeeStartDate,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className="fixed z-50 right-0 top-0 h-full w-[440px] max-w-[calc(100vw-2rem)] bg-[var(--ds-surface)] border-l border-[var(--ds-line)] shadow-[-12px_0_32px_rgba(15,17,21,0.10)] flex flex-col"
          aria-describedby={undefined}
        >
          <header className="h-12 shrink-0 px-4 flex items-center justify-between border-b border-[var(--ds-line)]">
            <div className="flex items-center gap-2">
              <Settings2 className="size-4 text-[var(--ds-muted)]" />
              <Dialog.Title className="text-[14px] font-semibold text-[var(--ds-ink)] m-0">
                Edit details
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="size-7 grid place-items-center rounded-md hover:bg-[var(--ds-line-2)] text-[var(--ds-muted)] hover:text-[var(--ds-ink)]">
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-auto p-4 space-y-5">
            <p className="text-[12px] text-[var(--ds-muted)] leading-relaxed">
              Update the wizard answers without leaving the editor. Saved changes apply to the next
              regeneration; existing section text isn't touched.
            </p>

            <Group label="Jurisdiction">
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label="Country"
                  value={jurisdiction}
                  onChange={(v) => setJurisdiction(v as "UK" | "US")}
                  options={[{ value: "UK", label: "United Kingdom" }, { value: "US", label: "United States" }]}
                />
                {jurisdiction === "UK" ? (
                  <SelectField
                    label="Region"
                    value={ukRegion ?? "England & Wales"}
                    onChange={(v) => setUkRegion(v as UkRegion)}
                    options={UK_REGIONS.map((r) => ({ value: r, label: r }))}
                  />
                ) : (
                  <TextField
                    label="State (2-letter)"
                    value={usState ?? ""}
                    onChange={(v) => setUsState(v.toUpperCase() as UsState)}
                    placeholder="CA"
                  />
                )}
              </div>
            </Group>

            <Group label="Worker classification">
              <SelectField
                value={workerClass}
                onChange={(v) => setWorkerClass(v as WorkerClass)}
                options={WORKER_CLASSES.map((w) => ({ value: w.value, label: w.label }))}
              />
            </Group>

            <Group label={isEmployer ? "Tone" : "Tone band"}>
              {isEmployer ? (
                <SelectField
                  value={tone}
                  onChange={(v) => setTone(v as Tone)}
                  options={TONES.map((t) => ({ value: t.value, label: t.label }))}
                />
              ) : (
                <SelectField
                  value={employeeTone}
                  onChange={(v) => setEmployeeTone(v as EmployeeTone)}
                  options={EMPLOYEE_TONES.map((t) => ({ value: t.value, label: t.label }))}
                />
              )}
            </Group>

            <Group label="Dates">
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  label="Issue date"
                  type="date"
                  value={issueDate}
                  onChange={setIssueDate}
                />
                <TextField
                  label="Effective date"
                  type="date"
                  value={effectiveDate}
                  onChange={setEffectiveDate}
                />
              </div>
            </Group>

            <Group label={isEmployer ? "Recipient (employee)" : "You (employee)"}>
              <TextField label="Full legal name" value={employeeName} onChange={setEmployeeName} />
              <TextField label="Job title" value={employeeJobTitle} onChange={setEmployeeJobTitle} />
              <TextField label="Address" value={employeeAddress} onChange={setEmployeeAddress} multiline />
              <TextField
                label="Continuous service start"
                type="date"
                value={employeeStartDate}
                onChange={setEmployeeStartDate}
              />
            </Group>

            <Group label={isEmployer ? "Your company (employer)" : "Recipient (employer)"}>
              <TextField label="Legal name" value={employerName} onChange={setEmployerName} />
              <TextField label="Address" value={employerAddress} onChange={setEmployerAddress} multiline />
            </Group>
          </div>

          <footer className="shrink-0 px-4 py-3 border-t border-[var(--ds-line)] flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave}>
              Save
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ds-muted)] mb-2">
        {label}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[11px] text-[var(--ds-muted)] font-medium mb-1">{label}</span>
      )}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full px-2.5 py-1.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)] resize-y"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-8 px-2.5 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[11px] text-[var(--ds-muted)] font-medium mb-1">{label}</span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 px-2 rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface)] text-[13px] text-[var(--ds-ink)] focus:outline-none focus:border-[var(--ds-ink)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
