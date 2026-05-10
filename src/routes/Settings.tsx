import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProfileStore } from "@/lib/profile";
import { useDraftStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Briefcase, UserRound, Save, Trash2, Download, Upload } from "lucide-react";

export function Settings() {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
  const setAutoFill = useProfileStore((s) => s.setAutoFill);
  const markSetupComplete = useProfileStore((s) => s.markSetupComplete);
  const resetProfile = useProfileStore((s) => s.reset);
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);

  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onSave = () => {
    markSetupComplete();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hr-letter-profile-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onImport = (file: File) => {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Partial<typeof profile>;
        if (!parsed || typeof parsed !== "object") throw new Error("Not a profile JSON.");
        if (
          !confirm(
            "Importing will replace your current profile. Drafts are unaffected. Continue?"
          )
        ) {
          return;
        }
        // Apply each section if present
        if (parsed.role) setRole(parsed.role);
        if (parsed.personal) patchPersonal(parsed.personal);
        if (parsed.employer) patchEmployer(parsed.employer);
        if (parsed.defaults) patchDefaults(parsed.defaults);
        if (typeof parsed.autoFill === "boolean") setAutoFill(parsed.autoFill);
        markSetupComplete();
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch (err) {
        alert(
          "Import failed: " + (err instanceof Error ? err.message : "Invalid file")
        );
      }
    });
  };

  const onClearAllData = () => {
    if (
      confirm(
        "This will erase your profile and all drafts from this device. Cloud-stored data is unaffected. Continue?"
      )
    ) {
      Object.keys(drafts).forEach((id) => deleteDraft(id));
      resetProfile();
      nav("/");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your role and saved details. Used to auto-fill new letters so you don't re-type the
          same fields every time.
        </p>
      </div>

      {/* Role */}
      <Card>
        <CardHeader>
          <CardTitle>Your role</CardTitle>
          <CardDescription>
            Drives the sidebar, the letter catalogue, and the legal angle of the prompts.
            Change it any time — your existing drafts keep the role they were created with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RoleCard
              active={profile.role === "employer"}
              icon={<Briefcase className="size-5" />}
              label="HR / Management"
              hint="I write letters TO employees"
              onClick={() => setRole("employer")}
            />
            <RoleCard
              active={profile.role === "employee"}
              icon={<UserRound className="size-5" />}
              label="Employee"
              hint="I write letters TO HR / employer"
              onClick={() => setRole("employee")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Personal */}
      <Card>
        <CardHeader>
          <CardTitle>
            {profile.role === "employer" ? "Your details (HR signatory)" : "Your details"}
          </CardTitle>
          <CardDescription>
            {profile.role === "employer"
              ? "These appear as the signatory on letters you draft."
              : "These appear as the sender on letters you draft. Saved to this device only."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Legal name">
            <Input
              value={profile.personal.legalName ?? ""}
              onChange={(e) => patchPersonal({ legalName: e.target.value })}
              placeholder="Jane Patel"
            />
          </Field>
          <Field label="Preferred name (used in salutations)">
            <Input
              value={profile.personal.preferredName ?? ""}
              onChange={(e) => patchPersonal({ preferredName: e.target.value })}
              placeholder="Jane"
            />
          </Field>
          <Field label={profile.role === "employer" ? "Job title (signatory)" : "Job title"}>
            <Input
              value={profile.personal.jobTitle ?? ""}
              onChange={(e) => patchPersonal({ jobTitle: e.target.value })}
              placeholder={profile.role === "employer" ? "HR Director" : "Senior Engineer"}
            />
          </Field>
          <Field label="Department">
            <Input
              value={profile.personal.department ?? ""}
              onChange={(e) => patchPersonal({ department: e.target.value })}
              placeholder="People Operations"
            />
          </Field>
          <Field label="Address" full>
            <Textarea
              value={profile.personal.address ?? ""}
              onChange={(e) => patchPersonal({ address: e.target.value })}
              rows={3}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={profile.personal.email ?? ""}
              onChange={(e) => patchPersonal({ email: e.target.value })}
            />
          </Field>
          {profile.role === "employee" && (
            <Field label="Continuous service start">
              <Input
                type="date"
                value={profile.personal.startDate ?? ""}
                onChange={(e) => patchPersonal({ startDate: e.target.value })}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      {/* Employer */}
      <Card>
        <CardHeader>
          <CardTitle>
            {profile.role === "employer" ? "Your company" : "Current employer"}
          </CardTitle>
          <CardDescription>
            {profile.role === "employer"
              ? "The legal entity issuing letters."
              : "The employer letters are addressed to. We'll use this for the recipient block."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Legal name" full>
            <Input
              value={profile.employer.legalName ?? ""}
              onChange={(e) => patchEmployer({ legalName: e.target.value })}
              placeholder="Acme Holdings Limited"
            />
          </Field>
          <Field label="Address" full>
            <Textarea
              value={profile.employer.address ?? ""}
              onChange={(e) => patchEmployer({ address: e.target.value })}
              rows={3}
            />
          </Field>
          <Field label="Companies House / EIN (optional)">
            <Input
              value={profile.employer.registrationNumber ?? ""}
              onChange={(e) => patchEmployer({ registrationNumber: e.target.value })}
            />
          </Field>
          {profile.role === "employee" && (
            <>
              <Field label="HR contact name">
                <Input
                  value={profile.employer.recipientName ?? ""}
                  onChange={(e) => patchEmployer({ recipientName: e.target.value })}
                  placeholder="HR Director"
                />
              </Field>
              <Field label="HR contact title">
                <Input
                  value={profile.employer.recipientTitle ?? ""}
                  onChange={(e) => patchEmployer({ recipientTitle: e.target.value })}
                />
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      {/* Defaults */}
      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <CardDescription>Pre-selected on every new letter.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Jurisdiction">
            <Select
              value={profile.defaults.jurisdiction}
              onValueChange={(v) => patchDefaults({ jurisdiction: v as "UK" | "US" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UK">United Kingdom</SelectItem>
                <SelectItem value="US">United States</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {profile.defaults.jurisdiction === "UK" ? (
            <Field label="UK region">
              <Select
                value={profile.defaults.ukRegion ?? "England & Wales"}
                onValueChange={(v) => patchDefaults({ ukRegion: v as "England & Wales" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="England & Wales">England & Wales</SelectItem>
                  <SelectItem value="Scotland">Scotland</SelectItem>
                  <SelectItem value="Northern Ireland">Northern Ireland</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="US state (free text — pick from list in wizard)">
              <Input
                value={profile.defaults.usState ?? ""}
                onChange={(e) => patchDefaults({ usState: e.target.value as "CA" })}
                placeholder="CA"
              />
            </Field>
          )}
          <Field label="Worker classification">
            <Select
              value={profile.defaults.workerClass}
              onValueChange={(v) => patchDefaults({ workerClass: v as "employee" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="worker">Worker (UK)</SelectItem>
                <SelectItem value="contractor">Contractor / 1099</SelectItem>
                <SelectItem value="casual">Casual / zero-hours</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={profile.role === "employer" ? "Default tone" : "Default tone band"}>
            {profile.role === "employer" ? (
              <Select
                value={profile.defaults.tone ?? "formal"}
                onValueChange={(v) => patchDefaults({ tone: v as "formal" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="firm">Firm</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={profile.defaults.employeeTone ?? "assertive"}
                onValueChange={(v) => patchDefaults({ employeeTone: v as "assertive" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conciliatory">Conciliatory</SelectItem>
                  <SelectItem value="assertive">Assertive</SelectItem>
                  <SelectItem value="forensic">Forensic</SelectItem>
                  <SelectItem value="tribunal_ready">Tribunal-ready</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
        </CardContent>
      </Card>

      {/* Auto-fill */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-fill new letters from this profile</CardTitle>
          <CardDescription>
            When on, the wizard pre-populates with your saved details. You can still edit any field.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch checked={profile.autoFill} onCheckedChange={setAutoFill} id="autoFill" />
          <Label htmlFor="autoFill">{profile.autoFill ? "On" : "Off"}</Label>
        </CardContent>
      </Card>

      <Separator />

      {/* Save / import-export / clear */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
        <Button variant="ghost" onClick={onClearAllData} className="text-destructive">
          <Trash2 className="size-4 mr-1.5" />
          Clear all my data on this device
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4 mr-1.5" />
            Import
          </Button>
          <Button variant="outline" onClick={onExport}>
            <Download className="size-4 mr-1.5" />
            Export
          </Button>
          {savedFlash && <span className="text-xs text-green-700">Saved</span>}
          <Button onClick={onSave}>
            <Save className="size-4 mr-1.5" />
            Save
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
        <p>
          Profile data lives in your browser's local storage. When we wire authentication and
          server-side persistence (planned), it will move to an encrypted database and become
          available across devices.
        </p>
      </div>
    </div>
  );
}

function RoleCard({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border p-4 transition-colors ${
        active
          ? "border-primary/40 bg-primary/5"
          : "border-letter-rule hover:border-foreground/30 hover:bg-accent/40"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="font-medium text-sm">{label}</span>
        {active && (
          <span className="ml-auto text-[10px] uppercase tracking-wider text-primary">Current</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
