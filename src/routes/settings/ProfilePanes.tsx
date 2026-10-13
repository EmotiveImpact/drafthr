import type { ReactNode } from "react";
import { Briefcase, Check, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "@/components/ds";
import { Field } from "@/components/wizard/kit";
import { DatePicker } from "@/components/wizard/DatePicker";
import { tintStyle, type Tint } from "@/components/templates/tints";
import { useProfileStore, QWEN_MODEL_OPTIONS, type QwenModelId } from "@/lib/profile";
import { DEFAULT_MODEL } from "@/lib/llm/default-model";
import { UNIVERSAL_STEPS } from "@/lib/letters/questions";
import type { EmployeeTone, Tone, UkRegion, UsState, WorkerClass } from "@/lib/letters/types";
import { cn } from "@/lib/utils";
import { FieldGrid, KitSelect, PaneHeader, SaveRow, SettingsCard, type KitOption } from "./parts";

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export function ProfilePane({ line, onSave, saved }: { line: string; onSave: () => void; saved: boolean }) {
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const employer = profile.role === "employer";

  return (
    <>
      <PaneHeader title="Profile" line={line} />
      <div className="flex flex-col gap-3.5">
        <SettingsCard
          title="Your role"
          description="Drives the sidebar, the letter catalogue and the legal angle of the prompts. Change it any time: your existing drafts keep the role they were created with."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="group" aria-label="Your role">
            <RoleCard
              active={profile.role === "employer"}
              icon={<Briefcase />}
              label="HR / Management"
              hint="I write letters to employees"
              tint="sky"
              onClick={() => setRole("employer")}
            />
            <RoleCard
              active={profile.role === "employee"}
              icon={<UserRound />}
              label="Employee"
              hint="I write letters to HR or my employer"
              tint="mint"
              onClick={() => setRole("employee")}
            />
          </div>
        </SettingsCard>

        <SettingsCard
          title={employer ? "Your details (HR signatory)" : "Your details"}
          description={
            employer
              ? "These appear as the signatory on letters you draft."
              : "These appear as the sender on letters you draft. Saved to this device only."
          }
        >
          <FieldGrid>
            <Field label="Legal name" htmlFor="set-legal-name">
              <Input
                id="set-legal-name"
                value={profile.personal.legalName ?? ""}
                onChange={(e) => patchPersonal({ legalName: e.target.value })}
                placeholder="Jane Patel"
                autoComplete="name"
              />
            </Field>
            <Field label="Preferred name (used in salutations)" htmlFor="set-pref-name">
              <Input
                id="set-pref-name"
                value={profile.personal.preferredName ?? ""}
                onChange={(e) => patchPersonal({ preferredName: e.target.value })}
                placeholder="Jane"
              />
            </Field>
            <Field label={employer ? "Job title (signatory)" : "Job title"} htmlFor="set-job-title">
              <Input
                id="set-job-title"
                value={profile.personal.jobTitle ?? ""}
                onChange={(e) => patchPersonal({ jobTitle: e.target.value })}
                placeholder={employer ? "HR director" : "Senior engineer"}
                autoComplete="organization-title"
              />
            </Field>
            <Field label="Department" htmlFor="set-department">
              <Input
                id="set-department"
                value={profile.personal.department ?? ""}
                onChange={(e) => patchPersonal({ department: e.target.value })}
                placeholder="People operations"
              />
            </Field>
            <Field label="Address" htmlFor="set-address" className="sm:col-span-2">
              <Textarea
                id="set-address"
                value={profile.personal.address ?? ""}
                onChange={(e) => patchPersonal({ address: e.target.value })}
                rows={3}
                placeholder="Street, city, postcode"
                autoComplete="street-address"
              />
            </Field>
            <Field label="Email" htmlFor="set-email">
              <Input
                id="set-email"
                type="email"
                value={profile.personal.email ?? ""}
                onChange={(e) => patchPersonal({ email: e.target.value })}
                autoComplete="email"
              />
            </Field>
            {!employer && (
              <Field label="Continuous service start" htmlFor="set-start-date">
                <DatePicker
                  id="set-start-date"
                  value={profile.personal.startDate ?? ""}
                  onChange={(v) => patchPersonal({ startDate: v ?? "" })}
                />
              </Field>
            )}
          </FieldGrid>
        </SettingsCard>
        <SaveRow onSave={onSave} saved={saved} />
      </div>
    </>
  );
}

function RoleCard({
  active,
  icon,
  label,
  hint,
  tint,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  hint: string;
  tint: Tint;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={tintStyle(tint)}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-[14px] border bg-[var(--ds-surface)] p-3 text-left transition-[border-color,background-color] duration-[120ms]",
        active
          ? "border-[var(--ds-ink)] shadow-[inset_0_0_0_1px_var(--ds-ink)]"
          : "border-[var(--ds-line)] hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-hover)]"
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--tint)] text-[var(--tint-ink)] [&_svg]:size-[18px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-[var(--ds-ink)]">{label}</span>
        <span className="block text-[12.5px] text-[var(--ds-muted)]">{hint}</span>
      </span>
      {active && (
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--ds-ink)] text-[var(--ds-on-accent)]">
          <Check className="size-3" aria-label="Current role" />
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Workspace (company)                                                 */
/* ------------------------------------------------------------------ */

export function WorkspacePane({ line, onSave, saved }: { line: string; onSave: () => void; saved: boolean }) {
  const profile = useProfileStore((s) => s.profile);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const employer = profile.role === "employer";

  return (
    <>
      <PaneHeader title="Workspace" line={line} />
      <div className="flex flex-col gap-3.5">
        <SettingsCard
          title={employer ? "Your company" : "Current employer"}
          description={
            employer
              ? "The legal entity issuing letters."
              : "The employer letters are addressed to. We'll use this for the recipient block."
          }
        >
          <FieldGrid>
            <Field label="Legal name" htmlFor="set-co-name" className="sm:col-span-2">
              <Input
                id="set-co-name"
                value={profile.employer.legalName ?? ""}
                onChange={(e) => patchEmployer({ legalName: e.target.value })}
                placeholder="Acme Holdings Limited"
                autoComplete="organization"
              />
            </Field>
            <Field label="Address" htmlFor="set-co-address" className="sm:col-span-2">
              <Textarea
                id="set-co-address"
                value={profile.employer.address ?? ""}
                onChange={(e) => patchEmployer({ address: e.target.value })}
                rows={3}
                placeholder="Street, city, postcode"
              />
            </Field>
            <Field label="Companies House / EIN (optional)" htmlFor="set-co-reg">
              <Input
                id="set-co-reg"
                value={profile.employer.registrationNumber ?? ""}
                onChange={(e) => patchEmployer({ registrationNumber: e.target.value })}
              />
            </Field>
            {!employer && (
              <>
                <Field label="HR contact name" htmlFor="set-co-hr-name">
                  <Input
                    id="set-co-hr-name"
                    value={profile.employer.recipientName ?? ""}
                    onChange={(e) => patchEmployer({ recipientName: e.target.value })}
                    placeholder="HR director"
                  />
                </Field>
                <Field label="HR contact title" htmlFor="set-co-hr-title">
                  <Input
                    id="set-co-hr-title"
                    value={profile.employer.recipientTitle ?? ""}
                    onChange={(e) => patchEmployer({ recipientTitle: e.target.value })}
                  />
                </Field>
              </>
            )}
          </FieldGrid>
        </SettingsCard>

        {employer && (
          <SettingsCard
            title="Letterhead and signature"
            description="Added to every letter you export. The preview shows where each one sits on the page."
          >
            <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_168px]">
              <div className="flex min-w-0 flex-col gap-5">
                <Field label="Letterhead image (optional)">
                  <ImageUploader
                    value={profile.employer.letterheadDataUrl}
                    onChange={(dataUrl) => patchEmployer({ letterheadDataUrl: dataUrl })}
                    aspect="banner"
                    helpText="Renders at the top of every exported letter. PNG / JPG / SVG, max 1 MB."
                  />
                </Field>
                <Field label="Signature image (optional)">
                  <ImageUploader
                    value={profile.employer.signatureDataUrl}
                    onChange={(dataUrl) => patchEmployer({ signatureDataUrl: dataUrl })}
                    aspect="signature"
                    helpText="Sits above the typed signatory name. Transparent PNG works best."
                  />
                </Field>
              </div>
              <PagePreview
                letterhead={profile.employer.letterheadDataUrl}
                signature={profile.employer.signatureDataUrl}
                signatory={profile.personal.legalName}
              />
            </div>
          </SettingsCard>
        )}
        <SaveRow onSave={onSave} saved={saved} />
      </div>
    </>
  );
}

/** A small pastel page that shows where the letterhead and signature sit. */
function PagePreview({ letterhead, signature, signatory }: { letterhead?: string; signature?: string; signatory?: string }) {
  return (
    <figure className="m-0 hidden md:block" aria-label="Page preview">
      <div
        style={tintStyle("lavender")}
        className="rounded-[12px] bg-[var(--tint)] p-3"
      >
        <div className="flex aspect-[1/1.414] flex-col rounded-[4px] bg-[var(--ds-surface)] p-2.5 shadow-[var(--ds-shadow-s)]">
          <div className="grid h-[22px] place-items-center overflow-hidden rounded-[3px] border border-dashed border-[var(--ds-line-strong)]">
            {letterhead ? (
              <img src={letterhead} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[9px] text-[var(--ds-subtle)]">Letterhead</span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-[5px]" aria-hidden>
            {[90, 100, 96, 100, 72, 100, 84].map((w, i) => (
              <span key={i} className="h-[3px] rounded-full bg-[var(--ds-surface-3)]" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="mt-auto">
            <div className="grid h-[18px] w-[64px] place-items-center overflow-hidden rounded-[3px] border border-dashed border-[var(--ds-line-strong)]">
              {signature ? (
                <img src={signature} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[8.5px] text-[var(--ds-subtle)]">Signature</span>
              )}
            </div>
            <div className="mt-1 truncate text-[8.5px] text-[var(--ds-muted)]">{signatory || "Signatory name"}</div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-[12px] text-[var(--ds-subtle)]">Where they sit</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Letter defaults                                                     */
/* ------------------------------------------------------------------ */

const UK_REGIONS: KitOption[] = [
  { value: "England & Wales", label: "England and Wales" },
  { value: "Scotland", label: "Scotland" },
  { value: "Northern Ireland", label: "Northern Ireland" },
];

/** The US states, from the same list the wizard uses. */
const US_STATES: KitOption[] = (() => {
  for (const step of UNIVERSAL_STEPS) {
    const q = step.questions.find((x) => x.id === "usState");
    if (q?.options) return q.options.map((o) => ({ value: o.value, label: o.label }));
  }
  return [];
})();

const WORKER_CLASSES: KitOption[] = [
  { value: "employee", label: "Employee" },
  { value: "worker", label: "Worker (UK)" },
  { value: "contractor", label: "Contractor / 1099" },
  { value: "casual", label: "Casual / zero-hours" },
];

const HR_TONES: KitOption[] = [
  { value: "warm", label: "Warm" },
  { value: "neutral", label: "Neutral" },
  { value: "formal", label: "Formal" },
  { value: "firm", label: "Firm" },
];

const EMPLOYEE_TONES: KitOption[] = [
  { value: "conciliatory", label: "Conciliatory" },
  { value: "assertive", label: "Assertive" },
  { value: "forensic", label: "Forensic" },
  { value: "tribunal_ready", label: "Tribunal-ready" },
];

export function DefaultsPane({ line, onSave, saved }: { line: string; onSave: () => void; saved: boolean }) {
  const profile = useProfileStore((s) => s.profile);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
  const setAutoFill = useProfileStore((s) => s.setAutoFill);
  const employer = profile.role === "employer";
  const d = profile.defaults;
  const model = d.qwenModel ?? DEFAULT_MODEL;

  return (
    <>
      <PaneHeader title="Letter defaults" line={line} />
      <div className="flex flex-col gap-3.5">
        <SettingsCard title="Defaults" description="Pre-selected on every new letter.">
          <FieldGrid>
            <Field label="Jurisdiction" htmlFor="set-juris">
              <KitSelect
                id="set-juris"
                value={d.jurisdiction}
                onValueChange={(v) => patchDefaults({ jurisdiction: v as "UK" | "US" })}
                options={[
                  { value: "UK", label: "United Kingdom" },
                  { value: "US", label: "United States" },
                ]}
              />
            </Field>
            {d.jurisdiction === "UK" ? (
              <Field label="UK region" htmlFor="set-region">
                <KitSelect
                  id="set-region"
                  value={d.ukRegion ?? "England & Wales"}
                  onValueChange={(v) => patchDefaults({ ukRegion: v as UkRegion })}
                  options={UK_REGIONS}
                />
              </Field>
            ) : (
              <Field label="US state" htmlFor="set-state">
                <KitSelect
                  id="set-state"
                  value={d.usState}
                  onValueChange={(v) => patchDefaults({ usState: v as UsState })}
                  options={US_STATES}
                  placeholder="Choose a state"
                />
              </Field>
            )}
            <Field label="Worker classification" htmlFor="set-worker">
              <KitSelect
                id="set-worker"
                value={d.workerClass}
                onValueChange={(v) => patchDefaults({ workerClass: v as WorkerClass })}
                options={WORKER_CLASSES}
              />
            </Field>
            <Field
              label="Generation model"
              htmlFor="set-model"
              help={QWEN_MODEL_OPTIONS.find((m) => m.id === model)?.hint}
            >
              <KitSelect
                id="set-model"
                value={model}
                onValueChange={(v) => patchDefaults({ qwenModel: v as QwenModelId })}
                options={QWEN_MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.label }))}
              />
            </Field>
            <Field label={employer ? "Default tone" : "Default tone band"} htmlFor="set-tone">
              {employer ? (
                <KitSelect
                  id="set-tone"
                  value={d.tone ?? "formal"}
                  onValueChange={(v) => patchDefaults({ tone: v as Tone })}
                  options={HR_TONES}
                />
              ) : (
                <KitSelect
                  id="set-tone"
                  value={d.employeeTone ?? "assertive"}
                  onValueChange={(v) => patchDefaults({ employeeTone: v as EmployeeTone })}
                  options={EMPLOYEE_TONES}
                />
              )}
            </Field>
          </FieldGrid>
        </SettingsCard>

        <SettingsCard>
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <label htmlFor="autoFill" className="block text-[15.5px] font-medium text-[var(--ds-ink)]">
                Auto-fill new letters from this profile
              </label>
              <p className="m-0 mt-1 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
                When on, the wizard fills in your saved details. You can still edit any field.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <span className="text-[13px] text-[var(--ds-muted)]" aria-hidden>
                {profile.autoFill ? "On" : "Off"}
              </span>
              <Switch id="autoFill" checked={profile.autoFill} onCheckedChange={setAutoFill} />
            </div>
          </div>
        </SettingsCard>
        <SaveRow onSave={onSave} saved={saved} />
      </div>
    </>
  );
}
