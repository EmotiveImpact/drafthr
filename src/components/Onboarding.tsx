import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, Check, UserRound, Sparkles } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { useProfileStore } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * First-run onboarding modal. Renders only when `profile.setupComplete`
 * is false. Three steps: role → jurisdiction → personal/employer
 * essentials. On completion the wizard's auto-fill will pre-populate
 * every letter so the user doesn't have to retype identity data.
 *
 * Skippable at any step — but then the user lands on Home without
 * auto-fill which materially hurts time-to-first-letter.
 */
const STEP_LABELS = ["Role", "Country", "Your details"] as const;

export function Onboarding() {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
  const markSetupComplete = useProfileStore((s) => s.markSetupComplete);

  const [step, setStep] = useState(profile.role ? 1 : 0);

  // Local form state seeded from any existing profile values so re-entry
  // (we never hide the modal mid-flow) doesn't drop user input.
  const [role, setRoleLocal] = useState(profile.role ?? "employer");
  const [jurisdiction, setJurisdiction] = useState<"UK" | "US">(profile.defaults.jurisdiction);
  const [ukRegion, setUkRegion] = useState(profile.defaults.ukRegion ?? "England & Wales");
  const [usState, setUsState] = useState(profile.defaults.usState ?? "");
  const [legalName, setLegalName] = useState(profile.personal.legalName ?? "");
  const [jobTitle, setJobTitle] = useState(profile.personal.jobTitle ?? "");
  const [employerName, setEmployerName] = useState(profile.employer.legalName ?? "");
  const [address, setAddress] = useState(profile.personal.address ?? "");

  const open = !profile.setupComplete;

  // Reset step whenever the modal re-opens (shouldn't happen normally,
  // but keeps state predictable for future reopens).
  // Skip the "which side" step when the role was already picked on the
  // mode-picker page, so the user isn't asked the same question twice.
  useEffect(() => {
    if (open) setStep(profile.role ? 1 : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSteps = 3;
  const canAdvance = useMemo(() => {
    if (step === 0) return !!role;
    if (step === 1) {
      if (jurisdiction === "UK") return !!ukRegion;
      if (jurisdiction === "US") return !!usState;
      return false;
    }
    if (step === 2) return legalName.trim().length > 0;
    return false;
  }, [step, role, jurisdiction, ukRegion, usState, legalName]);

  const persistAll = () => {
    setRole(role as "employer" | "employee");
    patchDefaults({
      jurisdiction,
      ukRegion: jurisdiction === "UK" ? (ukRegion as Parameters<typeof patchDefaults>[0]["ukRegion"]) : undefined,
      usState: jurisdiction === "US" ? (usState as Parameters<typeof patchDefaults>[0]["usState"]) : undefined,
    });
    if (legalName.trim()) patchPersonal({ legalName: legalName.trim() });
    if (jobTitle.trim()) patchPersonal({ jobTitle: jobTitle.trim() });
    if (address.trim()) patchPersonal({ address: address.trim() });
    if (employerName.trim()) patchEmployer({ legalName: employerName.trim() });
  };

  const finish = () => {
    persistAll();
    markSetupComplete();
    // Drop the user on their mode's home so the rest of the app makes
    // sense immediately.
    nav(role === "employer" ? "/hr" : "/me");
  };

  const skip = () => {
    // Persist whatever they did fill in — better than nothing — then
    // mark complete so we don't nag again.
    persistAll();
    markSetupComplete();
  };

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--ds-ink)]/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--ds-r-xl)] border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-l)] p-1.5 sm:grid sm:grid-cols-[220px_minmax(0,1fr)]">
          {/* 4B-style step list down the left side */}
          <aside className="rounded-[calc(var(--ds-r-xl)-6px)] bg-[var(--ds-surface-2)] p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[13px] text-[var(--ds-muted)]">
              <Sparkles className="size-3.5" aria-hidden />
              Welcome to DraftHR
            </div>
            <p className="m-0 mt-2 text-[13px] font-medium text-[var(--ds-ink)] sm:hidden">
              {`Step ${step + 1} of ${totalSteps}: ${STEP_LABELS[step]}`}
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--ds-line)]" aria-hidden>
              <div
                className="h-full rounded-full bg-[var(--ds-ink)] transition-[width]"
                style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
              />
            </div>
            <ol className="m-0 mt-4 hidden list-none p-0 sm:flex sm:flex-col sm:gap-1">
              {STEP_LABELS.map((label, i) => {
                const state = i < step ? "done" : i === step ? "current" : "todo";
                return (
                  <li
                    key={label}
                    aria-current={state === "current" ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[var(--ds-r-m)] text-[13.5px] sm:px-2 sm:py-2",
                      state === "current" && "font-medium text-[var(--ds-ink)] sm:bg-[var(--ds-surface)] sm:shadow-[var(--ds-shadow-s)]",
                      state === "done" && "text-[var(--ds-body)]",
                      state === "todo" && "text-[var(--ds-subtle)]"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full text-[11px]",
                        state === "done" && "bg-[var(--ds-ink)] text-[var(--ds-on-accent)]",
                        state === "current" && "border-[1.5px] border-[var(--ds-ink)] text-[var(--ds-ink)]",
                        state === "todo" && "border border-[var(--ds-line-strong)]"
                      )}
                      aria-hidden
                    >
                      {state === "done" ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className={cn(state !== "current" && "hidden sm:inline")}>{label}</span>
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="min-w-0 p-4 sm:p-6">
          <header className="mb-5">
            <Dialog.Title className="ds-title m-0 text-[28px] leading-[1.15]">
              {step === 0 && "Which side are you on?"}
              {step === 1 && "Where do you operate?"}
              {step === 2 && "A few essentials"}
            </Dialog.Title>
            <Dialog.Description className="text-[13.5px] text-[var(--ds-muted)] mt-1.5">
              {step === 0 && "We tailor every letter, wizard and disclaimer to your perspective."}
              {step === 1 && "Drives jurisdiction-specific clauses, limitation periods and language."}
              {step === 2 && "Pre-fills every wizard so you don't retype identity data."}
            </Dialog.Description>
          </header>

          {step === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <RoleCard
                icon={<Briefcase className="size-5" />}
                title="HR / Management"
                lede="Issuing letters on behalf of the company: offers, warnings, terminations and settlements."
                active={role === "employer"}
                onClick={() => setRoleLocal("employer")}
              />
              <RoleCard
                icon={<UserRound className="size-5" />}
                title="Employee"
                lede="Writing letters to your employer: grievance, resignation, accommodation and pay disputes."
                active={role === "employee"}
                onClick={() => setRoleLocal("employee")}
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <Label>Country</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setJurisdiction("UK")}
                    className={cn(
                      "rounded-[var(--ds-r-m)] border px-3 py-3 text-left transition",
                      jurisdiction === "UK"
                        ? "border-[var(--ds-ink)] bg-[var(--ds-surface-2)]"
                        : "border-[var(--ds-line)] hover:bg-[var(--ds-surface-2)]"
                    )}
                  >
                    <div className="text-[13px] font-medium">United Kingdom</div>
                    <div className="text-[12px] text-[var(--ds-muted)] mt-0.5">
                      ERA 1996, Equality Act 2010, ACAS Code
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setJurisdiction("US")}
                    className={cn(
                      "rounded-[var(--ds-r-m)] border px-3 py-3 text-left transition",
                      jurisdiction === "US"
                        ? "border-[var(--ds-ink)] bg-[var(--ds-surface-2)]"
                        : "border-[var(--ds-line)] hover:bg-[var(--ds-surface-2)]"
                    )}
                  >
                    <div className="text-[13px] font-medium">United States</div>
                    <div className="text-[12px] text-[var(--ds-muted)] mt-0.5">
                      Title VII, ADA, FMLA, state law
                    </div>
                  </button>
                </div>
              </div>

              {jurisdiction === "UK" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ob-region">UK region</Label>
                  <Select value={ukRegion} onValueChange={(v) => setUkRegion(v as typeof ukRegion)}>
                    <SelectTrigger id="ob-region">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="England & Wales">England and Wales</SelectItem>
                      <SelectItem value="Scotland">Scotland</SelectItem>
                      <SelectItem value="Northern Ireland">Northern Ireland</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {jurisdiction === "US" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ob-state">US state</Label>
                  <Input
                    id="ob-state"
                    placeholder="2-letter code (e.g. CA, NY)"
                    maxLength={2}
                    value={usState}
                    onChange={(e) => setUsState(e.target.value.toUpperCase())}
                  />
                  <p className="text-[12px] text-[var(--ds-muted)]">
                    Set the rest in <Link to="/settings" className="underline">Settings</Link> later.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-legal-name">
                  {role === "employer" ? "Your full name (as letter signatory)" : "Your full legal name"} *
                </Label>
                <Input
                  id="ob-legal-name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-job-title">
                  {role === "employer" ? "Your job title" : "Your current job title"}
                </Label>
                <Input
                  id="ob-job-title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder={role === "employer" ? "e.g. HR Director" : "e.g. Software Engineer"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-employer-name">
                  {role === "employer" ? "Your company's legal name" : "Your employer's legal name"}
                </Label>
                <Input
                  id="ob-employer-name"
                  value={employerName}
                  onChange={(e) => setEmployerName(e.target.value)}
                  placeholder="e.g. Acme Holdings Limited"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-address">Your address (for the letter)</Label>
                <Textarea
                  id="ob-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, city, postcode"
                />
              </div>
              <p className="text-[12px] text-[var(--ds-muted)]">
                Everything is optional, but the more you provide, the less you retype later.
              </p>
            </div>
          )}

          <footer className="flex items-center justify-between mt-6">
            <div>
              {step === 0 ? (
                <button
                  type="button"
                  onClick={skip}
                  className="text-[13px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
                >
                  Skip setup
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="text-[13px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
                >
                  Back
                </button>
              )}
            </div>
            <Button
              size="sm"
              disabled={!canAdvance}
              onClick={() => {
                if (step < totalSteps - 1) setStep(step + 1);
                else finish();
              }}
            >
              {step < totalSteps - 1 ? "Continue" : "Get started"}
            </Button>
          </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RoleCard({
  icon,
  title,
  lede,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  lede: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-[var(--ds-r-l)] border px-4 py-4 transition",
        active
          ? "border-[var(--ds-ink)] bg-[var(--ds-surface-2)] shadow-[var(--ds-shadow-s)]"
          : "border-[var(--ds-line)] hover:bg-[var(--ds-surface-2)]"
      )}
    >
      <div className="flex items-center gap-2 text-[var(--ds-ink)]">
        {icon}
        <span className="text-[14px] font-semibold">{title}</span>
      </div>
      <p className="text-[12.5px] text-[var(--ds-muted)] mt-1.5 leading-relaxed">{lede}</p>
    </button>
  );
}
