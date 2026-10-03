import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import type { ClosedTabRecoveryReview } from "@/lib/workspace-recovery-review";
import { useAuth } from "@/lib/auth";
import { isDatabaseWorkspaceEnabled } from "@/lib/workspace-flags";
import { browserWorkspaceRecovery, importBrowserWorkspace, initializeDatabaseWorkspace, loadWorkspaceConflicts, otherWorkspaceRecoveryCopies, pendingWorkspaceChanges, recoverClosedWorkspaceTabs,
  resolveWorkspaceConflict, reviewClosedWorkspaceTabs, retryDatabaseWorkspace, stopDatabaseWorkspace, useDatabaseWorkspaceStatus, workspaceFileContext, type WorkspaceConflict } from "@/lib/database-workspace";
import { AppLoadingScreen } from "./AppLoadingScreen";
import { WorkspaceRecoveryAction } from "./WorkspaceRecoveryAction";

function downloadRecovery(value: unknown, filename = "drafthr-unsaved-recovery.json") {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DatabaseWorkspaceBoundary({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isLoaded, activeTenant, user } = useAuth();
  const status = useDatabaseWorkspaceStatus();
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<WorkspaceConflict[]>([]);
  const [error, setError] = useState<string>();
  const [recoveryReview, setRecoveryReview] = useState<ClosedTabRecoveryReview>();
  const [recoveryChoices, setRecoveryChoices] = useState<Record<string, string>>({});
  const enabled = isDatabaseWorkspaceEnabled();
  const tenantId = activeTenant?.id, userId = user?.id;
  useEffect(() => {
    if (!enabled || !isLoaded || !tenantId || !userId) return;
    setConflicts([]); setError(undefined); setRecoveryReview(undefined); setRecoveryChoices({});
    void initializeDatabaseWorkspace(tenantId, userId);
    return stopDatabaseWorkspace;
  }, [enabled, isLoaded, tenantId, userId]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true); setError(undefined);
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  if (!enabled || !isLoaded || !tenantId || !userId) return <>{children}</>;
  if (status.identity !== `${userId}:${tenantId}` || status.phase === "off" || status.phase === "loading") return <AppLoadingScreen />;
  if (status.phase === "needs-import" || status.phase === "error") return (
    <main className="min-h-screen grid place-items-center bg-[var(--ds-canvas)] px-6">
      <section className="max-w-xl rounded-xl border bg-[var(--ds-surface)] p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{status.phase === "needs-import" ? "Move this browser’s work into the database?" : "Could not load your workspace"}</h1>
        {status.phase === "needs-import" ? <>
          <p className="mt-3 text-sm leading-6">This device has {status.importCount} records or settings awaiting import. Only import them if they belong to <strong>{activeTenant?.name}</strong>. Linked records are copied together; existing database records are not overwritten.</p>
          <p className="mt-2 text-sm leading-6">The browser originals remain until the database copy has been verified.</p>
          <button disabled={busy} className="mt-5 rounded-md border px-4 py-2 text-sm" onClick={() => void action(() => importBrowserWorkspace())}>{busy ? "Importing…" : "These belong here — import safely"}</button>
          <details className="mt-4 text-sm"><summary>Recovery and settings choices</summary>
            <p className="mt-2">If your database already has the correct settings, you can keep them and discard this browser’s settings after the records import. Download a backup first if you want to retain both settings versions.</p>
            <button className="mt-3 block underline" onClick={() => downloadRecovery(browserWorkspaceRecovery(), "drafthr-browser-recovery.json")}>Download all browser records and settings</button>
            <button disabled={busy} className="mt-3 block underline" onClick={() => void action(() => importBrowserWorkspace({ keepDatabaseSettings: true }))}>Import records; keep database settings and discard browser settings</button>
          </details>
        </> : <button disabled={busy} className="mt-5 rounded-md border px-4 py-2 text-sm" onClick={() => void action(() => initializeDatabaseWorkspace(tenantId, userId))}>Retry loading</button>}
        {(error || status.message) && <p role="alert" className="mt-3 text-sm text-red-700">{error || status.message}</p>}
      </section>
    </main>
  );
  return <>
    {/* Verified persistence can retire the last pending operation before its
        promise returns. Keep its controls mounted through completion so the
        guarded success callback can refresh conflicts and open a new copy. */}
    {(busy || status.pending > 0 || !status.recoverySafe || status.otherRecoveryCount > 0) && <section aria-label="Database save status" className="border-b bg-amber-50 px-5 py-3 text-sm text-amber-950">
      {status.pending > 0 && <p role="status">{status.failed ? `${status.failed} ${status.failed === 1 ? "change has" : "changes have"} not saved. Your pending edits are still on this device.` : `Saving ${status.pending} ${status.pending === 1 ? "change" : "changes"} to the database…`}</p>}
      {status.otherRecoveryCount > 0 && <div>
        <p>{status.otherRecoveryCount} other tabs have pending recovery data. Close those older tabs before taking over their unsaved work here.</p>
        <button disabled={busy} className="mt-2 mr-4 underline" onClick={() => void action(async () => {
          const review = reviewClosedWorkspaceTabs();
          if (review.groups.some(group => group.variants.length > 1)) {
            setRecoveryReview(review); setRecoveryChoices({});
          } else await recoverClosedWorkspaceTabs();
        })}>Older tabs are closed — recover their edits</button>
        <button className="mt-2 underline" onClick={() => downloadRecovery(otherWorkspaceRecoveryCopies(), "drafthr-other-tabs-recovery.json")}>Download other recovery copies</button>
        {recoveryReview && <section aria-label="Choose recovery versions" className="mt-4 flex flex-col gap-4">
          <h2 className="font-semibold">Choose which pending versions to keep</h2>
          <p>Choose one version for each record below. Non-conflicting edits are included automatically. Unselected versions will be discarded after the chosen edits are retained on this device; database conflicts still need review.</p>
          <Button variant="outline" size="sm" onClick={() => downloadRecovery(recoveryReview, "drafthr-all-recovery-versions.json")}>Download all versions before choosing</Button>
          {recoveryReview.groups.filter(group => group.variants.length > 1).map((group, groupIndex) => <section key={group.key}>
            <h3 id={`recovery-group-${groupIndex}`} className="font-medium">{group.key}</h3>
            <RadioGroup aria-labelledby={`recovery-group-${groupIndex}`} disabled={busy} value={recoveryChoices[group.key] ?? ""}
              onValueChange={source => setRecoveryChoices(previous => ({ ...previous, [group.key]: source }))}>
              {group.variants.map((variant, index) => <div key={variant.source} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id={`recovery-${groupIndex}-${index}`} value={variant.source} />
                  <Label htmlFor={`recovery-${groupIndex}-${index}`}>{variant.label} · {variant.operation.snapshot ? "Edit" : "Deletion"} · based on revision {variant.operation.baseRevision}</Label>
                </div>
                <details><summary>View {variant.label.toLowerCase()} content</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(variant.operation.snapshot, null, 2)}</pre></details>
              </div>)}
            </RadioGroup>
          </section>)}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" disabled={busy || recoveryReview.groups.some(group => group.variants.length > 1 && !recoveryChoices[group.key])} onClick={() => {
              if (!window.confirm("Recover the selected versions and discard the other pending versions shown here? Download all versions first if you want a backup. Database conflicts will still require review.")) return;
              void action(async () => {
                const scope = workspaceFileContext();
                await recoverClosedWorkspaceTabs({ review: recoveryReview, choices: recoveryChoices });
                if (scope.isCurrent()) { setRecoveryReview(undefined); setRecoveryChoices({}); }
              });
            }}>Recover selected versions and discard the others</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRecoveryReview(undefined)}>Cancel comparison</Button>
          </div>
        </section>}
      </div>}
      {!status.recoverySafe && <p role="alert">{status.message}</p>}
      {status.failed > 0 && <div className="mt-2 flex flex-wrap gap-4">
        <button disabled={busy} className="underline" onClick={() => void action(retryDatabaseWorkspace)}>Retry saves</button>
        <button disabled={busy} className="underline" onClick={() => void action(async () => setConflicts(await loadWorkspaceConflicts()))}>Review unsaved changes</button>
        <button className="underline" onClick={() => downloadRecovery({ version: 1, operations: pendingWorkspaceChanges() })}>Download recovery copy</button>
      </div>}
      {error && <p role="alert" className="mt-2">{error}</p>}
      {conflicts.map(conflict => <section key={`${conflict.operation.kind}:${conflict.operation.id}`} className="mt-3 rounded border border-amber-300 p-3">
        <h2 className="font-semibold">{conflict.operation.kind}: {conflict.operation.id}</h2>
        <p>{conflict.message}</p>
        {conflict.latest.deletedAt && conflict.operation.snapshot && conflict.operation.kind !== "preferences" && <p className="mt-2">Recovering creates a separate record; the original stays deleted. Existing links are retained but other records are not relinked automatically. Recovered letters need a new review and export.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <details><summary>My pending version</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(conflict.operation.snapshot, null, 2)}</pre></details>
          <details><summary>Database version{conflict.latest.deletedAt ? " (deleted)" : ""}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(conflict.latest.snapshot, null, 2)}</pre></details>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {conflict.operation.snapshot && (!conflict.latest.deletedAt || conflict.operation.kind !== "preferences") && <WorkspaceRecoveryAction key={JSON.stringify(conflict)} conflict={conflict} busy={busy} action={action} onRecovered={async id => {
            const scope = workspaceFileContext();
            const remaining = await loadWorkspaceConflicts();
            if (!scope.isCurrent()) return;
            setConflicts(remaining);
            if (!conflict.latest.deletedAt) { toast.success("Your version was saved and verified"); return; }
            toast.success("Recovered as a new record");
            if (conflict.operation.kind === "drafts") navigate(`/editor/${id}`);
            else if (conflict.operation.kind === "employees") navigate(`/employees/${id}`);
            else if (conflict.operation.kind === "matters") navigate(`/matters/${id}`);
          }} />}
          {!conflict.latest.deletedAt && !conflict.operation.snapshot && <button disabled={busy} className="underline" onClick={() => void action(async () => { await resolveWorkspaceConflict(conflict, "mine"); setConflicts(await loadWorkspaceConflicts()); })}>Save my version over this database version</button>}
          <button disabled={busy} className="underline" onClick={() => void action(async () => { await resolveWorkspaceConflict(conflict, "server"); setConflicts(await loadWorkspaceConflicts()); })}>Discard my pending edit and use database version</button>
        </div>
      </section>)}
    </section>}
    {children}
  </>;
}
