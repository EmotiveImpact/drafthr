import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
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
 * is false. ModePicker owns role selection, so setup has two steps:
 * jurisdiction → personal/employer
 * essentials. On completion the wizard's auto-fill will pre-populate
 * every letter so the user doesn't have to retype identity data.
 *
 * Skippable at any step — but then the user lands on Home without
 * auto-fill which materially hurts time-to-first-letter.
 */
export function Onboarding() {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
  const markSetupComplete = useProfileStore((s) => s.markSetupComplete);

  const [step, setStep] = useState(0);

  // Local form state seeded from any existing profile values so re-entry
  // (we never hide the modal mid-flow) doesn't drop user input.
  const role = profile.role ?? "employer";
  const [jurisdiction, setJurisdiction] = useState<"UK" | "US">(profile.defaults.jurisdiction);
  const [ukRegion, setUkRegion] = useState(profile.defaults.ukRegion ?? "England & Wales");
  const [usState, setUsState] = useState(profile.defaults.usState ?? "");
  const [legalName, setLegalName] = useState(profile.personal.legalName ?? "");
  const [jobTitle, setJobTitle] = useState(profile.personal.jobTitle ?? "");
  const [employerName, setEmployerName] = useState(profile.employer.legalName ?? "");
  const [address, setAddress] = useState(
    role === "employer" ? profile.employer.address ?? "" : profile.personal.address ?? "",
  );

  const open = !profile.setupComplete;

  // Reset step whenever the modal re-opens (shouldn't happen normally,
  // but keeps state predictable for future reopens).
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const totalSteps = 2;
  const canAdvance = useMemo(() => {
    if (step === 0) {
      if (jurisdiction === "UK") return !!ukRegion;
      if (jurisdiction === "US") return !!usState;
      return false;
    }
    if (step === 1) return legalName.trim().length > 0;
    return false;
  }, [step, jurisdiction, ukRegion, usState, legalName]);

  const persistAll = () => {
    patchDefaults({
      jurisdiction,
      ukRegion: jurisdiction === "UK" ? (ukRegion as Parameters<typeof patchDefaults>[0]["ukRegion"]) : undefined,
      usState: jurisdiction === "US" ? (usState as Parameters<typeof patchDefaults>[0]["usState"]) : undefined,
    });
    if (legalName.trim() || jobTitle.trim() || (role === "employee" && address.trim())) {
      patchPersonal({
        legalName: legalName.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        ...(role === "employee" && address.trim() ? { address: address.trim() } : {}),
      });
    }
    if (employerName.trim() || (role === "employer" && address.trim())) {
      patchEmployer({
        legalName: employerName.trim() || undefined,
        ...(role === "employer" && address.trim() ? { address: address.trim() } : {}),
        ...(role === "employer" && legalName.trim() ? { signatoryName: legalName.trim() } : {}),
        ...(role === "employer" && jobTitle.trim() ? { signatoryTitle: jobTitle.trim() } : {}),
      });
    }
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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--ds-line)] bg-[var(--ds-surface)] shadow-[0_30px_60px_rgba(15,17,21,0.20)] p-6">
          <header className="mb-4">
            <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-[var(--ds-muted)] font-semibold">
              <Sparkles className="size-3.5" />
              Welcome to DraftHR
            </div>
            <Dialog.Title className="m-0 mt-1 text-[22px] font-semibold text-[var(--ds-ink)]">
              {step === 0 && "Where do you operate?"}
              {step === 1 && "A few essentials"}
            </Dialog.Title>
            <Dialog.Description className="text-[13px] text-[var(--ds-muted)] mt-1">
              {step === 0 && "Drives jurisdiction-specific clauses, limitation periods, and language."}
              {step === 1 && "Pre-fills every wizard so you don't retype identity data."}
            </Dialog.Description>
          </header>

          {/* Progress dots */}
          <div
            className="flex items-center gap-1.5 mb-5"
            role="progressbar"
            aria-label="Workspace setup progress"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={step + 1}
            aria-valuetext={`Step ${step + 1} of ${totalSteps}`}
          >
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-[var(--ds-ink)]" : "bg-[var(--ds-line-2)]"
                )}
              />
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-3">
              <div>
                <Label>Country</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setJurisdiction("UK")}
                    className={cn(
                      "rounded-md border px-3 py-3 text-left transition",
                      jurisdiction === "UK"
                        ? "border-[var(--ds-ink)] bg-[var(--ds-line-2)]"
                        : "border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]/40"
                    )}
                  >
                    <div className="text-[13px] font-medium">United Kingdom</div>
                    <div className="text-[11px] text-[var(--ds-muted)] mt-0.5">
                      ERA 1996, Equality Act 2010, ACAS Code
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setJurisdiction("US")}
                    className={cn(
                      "rounded-md border px-3 py-3 text-left transition",
                      jurisdiction === "US"
                        ? "border-[var(--ds-ink)] bg-[var(--ds-line-2)]"
                        : "border-[var(--ds-line)] hover:bg-[var(--ds-line-2)]/40"
                    )}
                  >
                    <div className="text-[13px] font-medium">United States</div>
                    <div className="text-[11px] text-[var(--ds-muted)] mt-0.5">
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
                      <SelectItem value="England & Wales">England &amp; Wales</SelectItem>
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
                  <p className="text-[11px] text-[var(--ds-muted)]">
                    Set the rest in <Link to="/settings" className="underline">Settings</Link> later.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
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
                <Label htmlFor="ob-address">
                  {role === "employer"
                    ? "Company registered address"
                    : "Your address (for the letter)"}
                </Label>
                <Textarea
                  id="ob-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, city, postcode"
                />
              </div>
              <p className="text-[11px] text-[var(--ds-muted)]">
                Everything is optional — but the more you provide, the less you retype later.
              </p>
            </div>
          )}

          <footer className="flex items-center justify-between mt-6">
            <div>
              {step === 0 ? (
                <button
                  type="button"
                  onClick={skip}
                  className="text-[12px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
                >
                  Skip setup
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="text-[12px] text-[var(--ds-muted)] hover:text-[var(--ds-ink)] transition"
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
