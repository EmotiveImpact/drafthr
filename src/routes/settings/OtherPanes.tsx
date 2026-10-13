import { useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Download,
  ExternalLink,
  HardDrive,
  Info,
  Plug,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Callout, ConfirmDialog, Field } from "@/components/wizard/kit";
import { WorkspaceMembersCard } from "@/components/WorkspaceMembersCard";
import { SecurityCard } from "@/components/SecurityCard";
import { AuditLogsCard } from "@/components/AuditLogsCard";
import { useAuth } from "@/lib/auth";
import { useProfileStore, type Profile, type WorkspaceRole } from "@/lib/profile";
import { useDraftStore } from "@/lib/store";
import { todayDateOnly } from "@/lib/date-only";
import {
  ASSUMED_QUOTA_BYTES,
  NEAR_QUOTA_RATIO,
  estimateLocalStorageBytes,
  getStorageHealth,
  subscribeStorageHealth,
} from "@/lib/storage/quota-safe-storage";
import { cn } from "@/lib/utils";
import { KitSelect, PaneHeader, SavedPill, SettingsCard, useSavedFlash } from "./parts";
import { addPolicy, clearPolicies, normalisePolicyUrl, removePolicy, usePolicies } from "./policies";

const ADMIN_ROLES = new Set(["owner", "admin"]);

/* ------------------------------------------------------------------ */
/* Team and roles                                                      */
/* ------------------------------------------------------------------ */

const SIMULATED_ROLES = [
  { value: "owner", label: "Owner: full access, billing, members" },
  { value: "admin", label: "Admin: full access except billing" },
  { value: "drafter", label: "Drafter: write and submit for review" },
  { value: "reviewer", label: "Reviewer: drafter, plus approve or request changes" },
  { value: "viewer", label: "Viewer: read-only" },
];

export function TeamPane({ line }: { line: string }) {
  const { activeTenant } = useAuth();
  const isAdmin = ADMIN_ROLES.has(activeTenant?.role ?? "");
  const workspaceRole = useProfileStore((s) => s.profile.workspaceRole);
  const setWorkspaceRole = useProfileStore((s) => s.setWorkspaceRole);

  return (
    <>
      {activeTenant ? (
        <WorkspaceMembersCard header={(invite) => <PaneHeader title="Team and roles" line={line} right={invite} />} />
      ) : (
        <PaneHeader title="Team and roles" line={line} />
      )}
      <div className={cn("flex flex-col gap-3.5", activeTenant && "mt-3.5")}>
        {activeTenant && isAdmin && <DirectorySyncCard />}

        {!activeTenant && !import.meta.env.DEV && (
          <SettingsCard
            icon={<Users />}
            title="Team"
            description="Sign in to a workspace to invite teammates, change roles and manage access."
          />
        )}

        {/* Solo / simulated role picker: local dev and screencasts only. In a
         * real build it would let any member make themselves owner in the
         * browser, unlocking approve buttons and approved drafts for
         * client-side export. */}
        {import.meta.env.DEV && (
          <SettingsCard
            title="Role (local simulation)"
            description="Your seat for approval-queue simulation. The real per-workspace role is set above. Use this in local dev and demos to switch between drafter and reviewer behaviour without a second account."
          >
            <div className="max-w-[420px]">
              <Field label="Simulated role" htmlFor="set-sim-role">
                <KitSelect
                  id="set-sim-role"
                  value={workspaceRole ?? "owner"}
                  onValueChange={(v) => setWorkspaceRole(v as WorkspaceRole)}
                  options={SIMULATED_ROLES}
                />
              </Field>
            </div>
          </SettingsCard>
        )}
      </div>
    </>
  );
}

function DirectorySyncCard() {
  return (
    <SettingsCard
      icon={<Users />}
      title="Directory sync"
      description="Keep your staff list in step with your HR system or identity provider (SCIM, Google Workspace). Admins only."
      actions={
        <Button variant="outline" asChild>
          <Link to="/settings/directory-sync">
            Open directory sync
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Integrations and Directory Sync                                     */
/* ------------------------------------------------------------------ */

export function IntegrationsPane({ line }: { line: string }) {
  const { activeTenant } = useAuth();
  const isAdmin = ADMIN_ROLES.has(activeTenant?.role ?? "");
  return (
    <>
      <PaneHeader title="Integrations and Directory Sync" line={line} />
      <div className="flex flex-col gap-3.5">
        {activeTenant && isAdmin ? (
          <DirectorySyncCard />
        ) : (
          <SettingsCard
            icon={<Plug />}
            title="Directory sync"
            description={
              activeTenant
                ? "Only workspace admins can connect a directory. Ask an admin if you need your HR system or identity provider linked."
                : "Sign in to a workspace to connect your HR system or identity provider (SCIM, Google Workspace)."
            }
          />
        )}
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">
          Audit log streaming to WorkOS is under{" "}
          <Link to="/settings?tab=security" className="text-[var(--ds-ink)] underline underline-offset-2">
            Security
          </Link>
          .
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

export function SecurityPane({ line }: { line: string }) {
  const { activeTenant } = useAuth();
  return (
    <>
      <PaneHeader title="Security" line={line} />
      <div className="flex flex-col gap-3.5">
        {/* In-app password reset (signed-in users only). /sign-in/forgot-password
         * is signed-out only, so without this signed-in users have no path to
         * rotate their password. */}
        <SecurityCard />
        {/* WorkOS Audit Logs mirror status (admins only; renders nothing otherwise). */}
        <AuditLogsCard />
        {!activeTenant && (
          <SettingsCard
            title="Security"
            description="Password reset and audit log streaming appear here once you're signed in to a workspace."
          />
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

export function PoliciesPane({ line }: { line: string }) {
  const policies = usePolicies();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});
  const [saved, flash] = useSavedFlash();

  const onAdd = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Give the policy a name.";
    if (url.trim() && !normalisePolicyUrl(url)) next.url = "Enter a web address, such as intranet.example.co.uk/policies.";
    setErrors(next);
    if (next.name || next.url) return;
    addPolicy(name, url);
    setName("");
    setUrl("");
    flash();
  };

  return (
    <>
      <PaneHeader title="Policies" line={line} />
      <div className="flex flex-col gap-3.5">
        <SettingsCard
          icon={<BookOpen />}
          title="Your policies"
          description="Keep a list of the policies your letters point to, with a link to where staff can read each one. Saved in this browser. Letters don't use this list yet."
        >
          {policies.length === 0 ? (
            <p className="m-0 rounded-[12px] bg-[var(--ds-surface-2)] px-4 py-3 text-[13.5px] text-[var(--ds-muted)]">
              No policies added yet.
            </p>
          ) : (
            <ul className="m-0 list-none p-0" aria-label="Policies">
              {policies.map((p) => (
                <li
                  key={p.id}
                  className="flex min-w-0 items-center justify-between gap-3 border-t border-[var(--ds-line-2)] py-2.5 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-[var(--ds-ink)]">{p.name}</div>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 truncate text-[12.5px] text-[var(--ds-muted)] underline-offset-2 hover:text-[var(--ds-ink)] hover:underline"
                      >
                        <span className="truncate">{p.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                        <ExternalLink aria-hidden className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <div className="text-[12.5px] text-[var(--ds-subtle)]">No link</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => removePolicy(p.id)}
                    className="text-[var(--ds-red-fg)] hover:bg-[var(--ds-red-soft)]"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-4 grid grid-cols-1 items-start gap-3 border-t border-[var(--ds-line-2)] pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              onAdd();
            }}
          >
            <Field label="Policy name" htmlFor="pol-name" error={errors.name}>
              <Input
                id="pol-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Policy name"
                aria-invalid={errors.name ? true : undefined}
              />
            </Field>
            <Field label="Link (optional)" htmlFor="pol-url" error={errors.url}>
              <Input
                id="pol-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                inputMode="url"
                aria-invalid={errors.url ? true : undefined}
              />
            </Field>
            <div className="flex items-center gap-2 sm:pt-[27px]">
              <Button type="submit" variant="outline">
                <Plus className="size-4" />
                Add policy
              </Button>
              {saved && <SavedPill>Added</SavedPill>}
            </div>
          </form>
        </SettingsCard>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Privacy and data                                                    */
/* ------------------------------------------------------------------ */

const MAX_PROFILE_IMPORT_BYTES = 256 * 1024;

function useStoragePercent(): { percent: number; near: boolean; full: boolean } {
  const health = useSyncExternalStore(subscribeStorageHealth, getStorageHealth, getStorageHealth);
  let used = health.usedBytes;
  try {
    used = Math.max(used, estimateLocalStorageBytes());
  } catch {
    /* storage not readable: fall back to the last known figure */
  }
  const ratio = used / ASSUMED_QUOTA_BYTES;
  return {
    percent: Math.min(100, Math.round(ratio * 100)),
    near: health.nearQuota || ratio >= NEAR_QUOTA_RATIO,
    full: health.full,
  };
}

export function DataPane({ line }: { line: string }) {
  const nav = useNavigate();
  const profile = useProfileStore((s) => s.profile);
  const setRole = useProfileStore((s) => s.setRole);
  const patchPersonal = useProfileStore((s) => s.patchPersonal);
  const patchEmployer = useProfileStore((s) => s.patchEmployer);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
  const setAutoFill = useProfileStore((s) => s.setAutoFill);
  const markSetupComplete = useProfileStore((s) => s.markSetupComplete);
  const resetProfile = useProfileStore((s) => s.reset);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Partial<Profile> | null>(null);
  const [clearing, setClearing] = useState(false);
  const [imported, flashImported] = useSavedFlash();
  const storage = useStoragePercent();

  const onExport = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drafthr-profile-${todayDateOnly()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onPickFile = (file: File) => {
    setImportError(null);
    if (file.size > MAX_PROFILE_IMPORT_BYTES) {
      setImportError("Import failed: profile JSON must be 256 KB or smaller.");
      return;
    }
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as Partial<Profile>;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Not a profile JSON.");
        setPendingImport(parsed);
      })
      .catch((err: unknown) => {
        setImportError(
          "Import failed: " + (err instanceof SyntaxError ? "the file isn't valid JSON." : err instanceof Error ? err.message : "Invalid file")
        );
      });
  };

  const applyImport = () => {
    const parsed = pendingImport;
    if (!parsed) return;
    if (parsed.role === "employer" || parsed.role === "employee") setRole(parsed.role);
    if (parsed.personal) patchPersonal(parsed.personal);
    if (parsed.employer) patchEmployer(parsed.employer);
    if (parsed.defaults) patchDefaults(parsed.defaults);
    if (typeof parsed.autoFill === "boolean") setAutoFill(parsed.autoFill);
    markSetupComplete();
    setPendingImport(null);
    flashImported();
  };

  const onClearAllData = () => {
    // Local wipe only: deleteDraft would also delete each letter from the
    // workspace, which this "this device only" action promises not to do.
    useDraftStore.setState({ drafts: {} });
    resetProfile();
    clearPolicies();
    setClearing(false);
    nav("/");
  };

  return (
    <>
      <PaneHeader title="Privacy and data" line={line} />
      <div className="flex flex-col gap-3.5">
        <SettingsCard
          title="Your data"
          description="Export your profile as a file, import one from another device, or clear everything stored in this browser."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" />
                Import
              </Button>
              <Button variant="outline" onClick={onExport}>
                <Download className="size-4" />
                Export
              </Button>
              {imported && <SavedPill>Imported</SavedPill>}
            </div>
            <Button
              variant="ghost"
              onClick={() => setClearing(true)}
              className="self-start text-[var(--ds-red-fg)] hover:bg-[var(--ds-red-soft)] sm:self-auto"
            >
              <Trash2 className="size-4" />
              Clear all my data on this device
            </Button>
          </div>
          {importError && (
            <Callout tone="error" role="alert" className="mt-4">
              {importError}
            </Callout>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-[var(--ds-surface-2)] px-3.5 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--ds-muted)]" aria-hidden />
            <p className="m-0 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">
              Profile data lives in your browser's local storage. When we wire authentication and server-side
              persistence (planned), it will move to an encrypted database and become available across devices.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard icon={<HardDrive />} title="Storage on this device">
          <p className="m-0 text-[13.5px] text-[var(--ds-body)]">
            {storage.percent < 1 ? "Less than 1%" : `About ${storage.percent}%`} of this browser's storage is used.
            {storage.full
              ? " It is full, so recent changes may not be saved here."
              : storage.near
                ? " It is nearly full: remove large letterhead or signature images, or export and delete old letters."
                : ""}
          </p>
          <div
            role="meter"
            aria-label="Browser storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={storage.percent}
            className="mt-3 h-[5px] overflow-hidden rounded-[5px] bg-[var(--ds-surface-3)]"
          >
            <i
              className={cn(
                "block h-full rounded-[5px]",
                storage.full ? "bg-[var(--ds-red-solid)]" : storage.near ? "bg-[var(--ds-amber-solid)]" : "bg-[var(--ds-ink)]"
              )}
              style={{ width: `${Math.max(storage.percent, 1)}%` }}
            />
          </div>
        </SettingsCard>

        <p className="m-0 text-[13px] text-[var(--ds-muted)]">
          Read the{" "}
          <Link to="/privacy" className="text-[var(--ds-ink)] underline underline-offset-2">
            Privacy policy
          </Link>{" "}
          and the{" "}
          <Link to="/terms" className="text-[var(--ds-ink)] underline underline-offset-2">
            Terms
          </Link>
          .
        </p>
      </div>

      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(o) => !o && setPendingImport(null)}
        title="Replace your profile?"
        description="Importing will replace your current profile. Drafts are unaffected."
        confirmLabel="Import profile"
        onConfirm={applyImport}
      />
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear all data on this device?"
        description="This will erase your profile and all drafts from this device. Cloud-stored data is unaffected."
        confirmLabel="Clear my data"
        destructive
        onConfirm={onClearAllData}
      />
    </>
  );
}
