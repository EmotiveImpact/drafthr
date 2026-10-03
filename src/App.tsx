import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useProfileStore, type WorkspaceRole } from "@/lib/profile";
import { migrateEmployerImages } from "@/lib/storage/migrate";
import { useDraftStore } from "@/lib/store";
import {
  isDualWriteEnabled,
  persistedDraftTombstones,
  reissuePendingDeletes,
  syncAllPending,
} from "@/lib/dual-write";
import {
  pullRemoteDrafts,
  mergeRemoteDrafts,
  pullRemoteExtras,
  mergeRemoteExtras,
} from "@/lib/remote-pull";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  importBrowserDrafts,
  initializeDatabaseDrafts,
  isDatabaseDraftsEnabled,
  recoverConflictedDraftsAsCopies,
  retryFailedDatabaseDrafts,
  useDatabaseDraftStatus,
} from "@/lib/database-drafts";
import { Home } from "@/routes/Home";
import { Wizard } from "@/routes/Wizard";
import { RootRedirect } from "@/routes/RootRedirect";
import { ModePicker } from "@/routes/ModePicker";
import { Settings } from "@/routes/Settings";
import { DirectorySync as SettingsDirectorySync } from "@/routes/settings/DirectorySync";
import { Privacy } from "@/routes/Privacy";
import { Terms } from "@/routes/Terms";
import { BrowseLetters } from "@/routes/BrowseLetters";
import { PaywallGate } from "@/components/billing/PaywallGate";
import { ReviewStep } from "@/routes/ReviewStep";
import { MattersIndex } from "@/routes/MattersIndex";
import { EmployeesIndex } from "@/routes/EmployeesIndex";
import { Approvals } from "@/routes/Approvals";
// Heavy / non-first-paint routes are lazy-loaded — they pulled ~hundreds of KB
// into the main chunk (Reports charts, BulkOps CSV+merge, Finalize export
// pipeline, MatterDetail/EmployeeDetail). (Senior sweep I-PERF-1.) See the
// lazy() block below for the rest (Editor, EvidenceStep, ConsultantsIndex,
// MobileReadView).
const Mockups = lazy(() => import("@/routes/Mockups").then((m) => ({ default: m.Mockups })));
const Calendar = lazy(() => import("@/routes/Calendar").then((m) => ({ default: m.Calendar })));
const Exported = lazy(() => import("@/routes/Exported").then((m) => ({ default: m.Exported })));
const Activity = lazy(() => import("@/routes/Activity").then((m) => ({ default: m.Activity })));
const Notifications = lazy(() => import("@/routes/Notifications").then((m) => ({ default: m.Notifications })));
const Finalize = lazy(() => import("@/routes/Finalize").then((m) => ({ default: m.Finalize })));
const MatterDetail = lazy(() => import("@/routes/MatterDetail").then((m) => ({ default: m.MatterDetail })));
const EmployeeDetail = lazy(() => import("@/routes/EmployeeDetail").then((m) => ({ default: m.EmployeeDetail })));
const BulkOperations = lazy(() => import("@/routes/BulkOperations"));
const Reports = lazy(() => import("@/routes/Reports").then((m) => ({ default: m.Reports })));
import { MatterDrillDown } from "@/components/reports/MatterDrillDown";
import { FailingCheckDrillDown } from "@/components/reports/FailingCheckDrillDown";
import { SignIn } from "@/routes/SignIn";
import { SignUp } from "@/routes/SignUp";
import { ForgotPassword } from "@/routes/ForgotPassword";
import { ResetPassword } from "@/routes/ResetPassword";
import { VerifyEmail } from "@/routes/VerifyEmail";
import { AuthCallback } from "@/routes/AuthCallback";
import { SignupWorkspace } from "@/routes/SignupWorkspace";
import { JoinInvite } from "@/routes/JoinInvite";
import { ConsultantHome } from "@/routes/ConsultantHome";
import { ConsultantProfile } from "@/routes/ConsultantProfile";
import { MyBookings } from "@/routes/MyBookings";
import { ConsultantAdminReview } from "@/routes/ConsultantAdminReview";
import { SharedDraftReview } from "@/routes/SharedDraftReview";
import { Layout } from "@/components/Layout";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { DatabaseWorkspaceBoundary } from "@/components/DatabaseWorkspaceBoundary";
import { NotFound } from "@/routes/NotFound";
import { Protected } from "@/lib/auth/Protected";
// Lazy — react-joyride is a one-time first-run tour; keep it out of the main
// chunk so it loads only when the tour actually shows. (Senior sweep I-PERF-2.)
const OnboardingTour = lazy(() =>
  import("@/components/onboarding/OnboardingTour").then((m) => ({ default: m.OnboardingTour })),
);
import { hasSeenTour } from "@/lib/onboarding";

// Editor pulls in Tiptap + extensions + draft orchestrator (~600 KB gzipped).
// Lazy-load so the home/landing/wizard routes stay snappy.
const Editor = lazy(() =>
  import("@/routes/Editor").then((m) => ({ default: m.Editor }))
);

// EvidenceStep is the full-page evidence management surface. Lazy-loaded so
// it doesn't bloat the main bundle — it shares code with Editor but the
// EvidencePanel + EvidenceRequirementsList are non-trivial. Accessed via
// "Manage evidence" in the EvidenceDrawer footer, and from the per-section
// "Open evidence" shortcut inside the letter editor.
const EvidenceStep = lazy(() =>
  import("@/routes/EvidenceStep").then((m) => ({ default: m.EvidenceStep }))
);

// Consultant marketplace — lazy-loaded to keep the main bundle lean.
const ConsultantsIndex = lazy(() =>
  import("@/routes/ConsultantsIndex").then((m) => ({ default: m.ConsultantsIndex }))
);
const Pricing = lazy(() => import("@/routes/Pricing").then((m) => ({ default: m.Pricing })));

// Mobile read-only view — `/m/:draftId`. Chromeless, scrollable, no editing.
// Lazy-loaded so phone users don't pay for the editor bundle when they just
// want to read.
const MobileReadView = lazy(() =>
  import("@/routes/MobileReadView").then((m) => ({ default: m.MobileReadView }))
);

export function App() {
  return <DatabaseWorkspaceBoundary><AppContent /></DatabaseWorkspaceBoundary>;
}

function AppContent() {
  const location = useLocation();
  const { activeTenant, isLoaded, user } = useAuth();
  const setupComplete = useProfileStore((s) => s.profile.setupComplete);
  const databaseDraftStatus = useDatabaseDraftStatus();
  useEffect(() => {
    if (!isDatabaseDraftsEnabled() || !isLoaded || !user || !activeTenant) return;
    void initializeDatabaseDrafts(activeTenant.id);
  }, [isLoaded, user?.id, activeTenant?.id]);
  // One-shot migration for existing base64 letterhead/signature → Blob URL.
  // Pre-migration users have ~700 KB+ of base64 sitting in localStorage; this
  // swaps them out lazily so the dual-write rollout doesn't carry those blobs
  // into Postgres. Idempotent: helper skips anything not already a data: URL.
  useEffect(() => {
    let cancelled = false;
    const { profile, patchEmployer } = useProfileStore.getState();
    const before = profile.employer;
    void migrateEmployerImages(before).then((patch) => {
      if (cancelled || !patch) return;
      // Compare-and-set: only apply a migrated URL if that image field is STILL
      // the original value the migration started from. The upload round-trip is
      // slow; if the user uploaded a new letterhead/signature in Settings
      // meanwhile, applying the stale migrated URL would silently revert it
      // (bug #17). Re-read the live store at apply time.
      const cur = useProfileStore.getState().profile.employer;
      const safe: typeof patch = {};
      if (patch.letterheadDataUrl !== undefined && cur.letterheadDataUrl === before.letterheadDataUrl) {
        safe.letterheadDataUrl = patch.letterheadDataUrl;
      }
      if (patch.signatureDataUrl !== undefined && cur.signatureDataUrl === before.signatureDataUrl) {
        safe.signatureDataUrl = patch.signatureDataUrl;
      }
      if (Object.keys(safe).length > 0) patchEmployer(safe);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dual-write backfill — when the flag is on AND the user has an active
  // tenant, POST every locally-known draft that hasn't synced yet. Runs once
  // per mount; idempotent for re-runs (already-synced drafts no-op).
  useEffect(() => {
    if (!isLoaded || !activeTenant || !isDualWriteEnabled()) return;
    let cancelled = false;
    const drafts = Object.values(useDraftStore.getState().drafts);
    if (drafts.length === 0) return;
    void syncAllPending(() => Object.values(useDraftStore.getState().drafts)).then((result) => {
      if (cancelled) return;
      if (result.ok > 0) {
        toast.success(`${result.ok} draft${result.ok === 1 ? "" : "s"} synced to your workspace.`);
      }
      if (result.failed > 0) {
        console.warn(`[dual-write] backfill: ${result.failed} drafts failed to sync`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, activeTenant]);

  // Cross-device PULL — when the flag is on AND the user has an active tenant,
  // fetch the tenant's drafts from the server and merge them into the local
  // store so a second device / teammate sees the same letters. The merge is
  // non-destructive (preserves newer local edits + all local-only fields).
  useEffect(() => {
    if (!isLoaded || !activeTenant || !isDualWriteEnabled()) return;
    let cancelled = false;
    void (async () => {
      // Retry deletes that never got a confirmed 2xx (tab closed / offline)
      // BEFORE pulling, so a pending-delete row is gone rather than merged.
      await reissuePendingDeletes();
      if (cancelled) return;
      await pullRemoteDrafts((remote) => {
        if (cancelled) return;
        // Re-read the live store at apply time so a concurrent edit isn't lost.
        // Skip adoption of rows whose delete is still unconfirmed (BUG-05).
        const local = useDraftStore.getState().drafts;
        useDraftStore.setState({
          drafts: mergeRemoteDrafts(local, remote, persistedDraftTombstones()),
        });
      });
      if (cancelled) return;
      // Then merge collaboration data (comments / timeline / approvals) — a
      // separate best-effort pull so a missing extras table can't break drafts.
      await pullRemoteExtras((remoteExtras) => {
        if (cancelled) return;
        const local = useDraftStore.getState().drafts;
        useDraftStore.setState({ drafts: mergeRemoteExtras(local, remoteExtras) });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, activeTenant]);

  // Hydrate the workspace role from the SERVER (the authoritative
  // tenant-membership role) instead of the local "owner" default. The
  // tenant_members role values are exactly the WorkspaceRole enum
  // (owner/admin/drafter/reviewer/viewer), so a viewer/drafter no longer sees
  // owner-level UI they aren't entitled to. Re-runs on workspace switch.
  useEffect(() => {
    const role = activeTenant?.role;
    if (!role) return;
    const VALID: WorkspaceRole[] = ["owner", "admin", "drafter", "reviewer", "viewer"];
    if (!(VALID as string[]).includes(role)) return;
    const { profile, setWorkspaceRole } = useProfileStore.getState();
    if (profile.workspaceRole !== role) setWorkspaceRole(role as WorkspaceRole);
  }, [activeTenant]);
  // Preserve the existing route reset behaviour without animating the page.
  // Editor subroutes remain mounted as a group so its in-progress UI stays put.
  const routeKey = location.pathname.startsWith("/editor/") ? "editor" : location.pathname;
  // Onboarding tour gate — only on the first signed-in landing inside the
  // app (/hr or /me). Wait until workspace setup is dismissed/completed:
  // otherwise two focus-trapping overlays compete and the tour repositions
  // over the setup dialog while the page is still settling.
  const onTourSurface =
    location.pathname.startsWith("/hr") || location.pathname.startsWith("/me");
  const showTour =
    isLoaded &&
    !!user &&
    !!activeTenant &&
    setupComplete &&
    onTourSurface &&
    !hasSeenTour();
  if (isDatabaseDraftsEnabled() && isLoaded && user && activeTenant &&
      (databaseDraftStatus.phase !== "ready" || databaseDraftStatus.tenantId !== activeTenant.id)) {
    if (databaseDraftStatus.phase === "needs-import" && databaseDraftStatus.tenantId === activeTenant.id) {
      return (
        <main className="min-h-screen grid place-items-center bg-[var(--ds-canvas)] px-6">
          <section className="max-w-lg rounded-xl border bg-[var(--ds-surface)] p-8 shadow-sm">
            <h1 className="text-xl font-semibold">Import drafts from this browser?</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--ds-body)]">
              {databaseDraftStatus.importCount} draft{databaseDraftStatus.importCount === 1 ? "" : "s"} on this device have not been verified against your workspace database. Import only if they belong to <strong>{activeTenant.name}</strong>. A different database version is kept; your browser version becomes a separate recovered copy.
            </p>
            {databaseDraftStatus.message && <p role="alert" className="mt-3 text-sm text-red-700">{databaseDraftStatus.message}</p>}
            <button type="button" className="mt-5 rounded-md bg-[var(--ds-ink)] px-4 py-2 text-sm text-white" onClick={() => void importBrowserDrafts()}>
              Import safely into this workspace
            </button>
          </section>
        </main>
      );
    }
    if (databaseDraftStatus.phase === "error" && databaseDraftStatus.tenantId === activeTenant.id) {
      return (
        <main className="min-h-screen grid place-items-center bg-[var(--ds-canvas)] px-6">
          <section className="max-w-lg rounded-xl border bg-[var(--ds-surface)] p-8 shadow-sm">
            <h1 className="text-xl font-semibold">Could not load workspace drafts</h1>
            <p role="alert" className="mt-3 text-sm">{databaseDraftStatus.message ?? "Please check your connection and try again."} Your browser recovery copy has not been changed.</p>
            <button type="button" className="mt-5 rounded-md border px-4 py-2 text-sm" onClick={() => void initializeDatabaseDrafts(activeTenant.id)}>Retry</button>
          </section>
        </main>
      );
    }
    return <AppLoadingScreen />;
  }
  return (
    <Layout>
      {isDatabaseDraftsEnabled() && databaseDraftStatus.phase === "ready" &&
        (databaseDraftStatus.saving > 0 || databaseDraftStatus.failed > 0) && (
          <div role="status" className="flex items-center gap-3 border-b bg-amber-50 px-5 py-2 text-xs text-amber-950">
            {databaseDraftStatus.failed > 0
              ? `${databaseDraftStatus.failed} draft change${databaseDraftStatus.failed === 1 ? " is" : "s are"} still on this device, not saved to the database.`
              : `Saving ${databaseDraftStatus.saving} draft change${databaseDraftStatus.saving === 1 ? "" : "s"}…`}
            {databaseDraftStatus.failed > 0 && databaseDraftStatus.conflicts === 0 &&
              <button type="button" className="underline" onClick={retryFailedDatabaseDrafts}>Retry save</button>}
            {databaseDraftStatus.conflicts > 0 &&
              <button type="button" className="underline" onClick={() => void recoverConflictedDraftsAsCopies()}>Save conflicts as separate copies</button>}
          </div>
        )}
      {showTour && (
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      )}
      <div key={routeKey} className="h-full flex flex-col flex-1 min-h-0">
          {/* One Suspense boundary for all lazy routes (I-PERF-1). Inner
           * per-route boundaries (editor/evidence/etc.) still apply too. */}
          <Suspense fallback={<AppLoadingScreen scope="page" />}>
          <Routes location={location}>
            {/* / handles its own auth-state branching (signed-out landing,
             * tenant-less redirect, role-less ModePicker, fully-onboarded
             * route-to-home). Wrapping in <Protected> would trigger a
             * useEffect race and flash content from the previous state. */}
            <Route path="/" element={<RootRedirect />} />
        <Route path="/pick-role" element={<Protected><ModePicker /></Protected>} />

        <Route path="/hr" element={<Protected roles={["employer"]}><Home mode="employer" /></Protected>} />
        <Route path="/hr/new" element={<Protected roles={["employer"]}><BrowseLetters mode="employer" /></Protected>} />
        <Route path="/hr/new/:letterType" element={<Protected roles={["employer"]}><PaywallGate><Wizard mode="employer" /></PaywallGate></Protected>} />

        <Route path="/me" element={<Protected roles={["employee"]}><Home mode="employee" /></Protected>} />
        <Route path="/me/new" element={<Protected roles={["employee"]}><BrowseLetters mode="employee" /></Protected>} />
        <Route path="/me/new/:letterType" element={<Protected roles={["employee"]}><PaywallGate><Wizard mode="employee" /></PaywallGate></Protected>} />

        <Route
          path="/editor/:draftId"
          element={
            <Protected>
              <Suspense fallback={<AppLoadingScreen scope="page" />}>
                <Editor />
              </Suspense>
            </Protected>
          }
        />
        <Route
          path="/editor/:draftId/evidence"
          element={
            <Protected>
              <Suspense fallback={<AppLoadingScreen scope="page" />}>
                <EvidenceStep />
              </Suspense>
            </Protected>
          }
        />
        <Route path="/editor/:draftId/review" element={<Protected><ReviewStep /></Protected>} />
        <Route path="/editor/:draftId/finalize" element={<Protected><Finalize /></Protected>} />
        {/* HR portfolio surfaces — employer role only. Previously these
         * were auth-gated but not role-gated, so an employee/consultant
         * could render them by typing the URL (data was API-scoped, but
         * the surface shouldn't show). */}
        <Route path="/matters" element={<Protected roles={["employer"]}><MattersIndex /></Protected>} />
        <Route path="/matters/:matterId" element={<Protected roles={["employer"]}><MatterDetail /></Protected>} />
        <Route path="/employees" element={<Protected roles={["employer"]}><EmployeesIndex /></Protected>} />
        <Route path="/employees/:employeeId" element={<Protected roles={["employer"]}><EmployeeDetail /></Protected>} />
        <Route path="/bulk" element={<Protected roles={["employer"]}><PaywallGate><BulkOperations /></PaywallGate></Protected>} />
        <Route path="/approvals" element={<Protected roles={["employer"]}><Approvals /></Protected>} />
        <Route path="/reports" element={<Protected roles={["employer"]}><Reports /></Protected>} />
        <Route path="/reports/matters/:matterId" element={<Protected roles={["employer"]}><MatterDrillDown /></Protected>} />
        <Route path="/reports/checks/:checkId" element={<Protected roles={["employer"]}><FailingCheckDrillDown /></Protected>} />

        <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
        <Route path="/exported" element={<Protected><Exported /></Protected>} />
        <Route path="/activity" element={<Protected><Activity /></Protected>} />
        <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/settings/directory-sync" element={<Protected><SettingsDirectorySync /></Protected>} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-in/signup" element={<SignUp />} />
        <Route path="/sign-in/forgot-password" element={<ForgotPassword />} />
        <Route path="/sign-in/reset-password" element={<ResetPassword />} />
        <Route path="/sign-in/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/signup/workspace" element={<Protected><SignupWorkspace /></Protected>} />
        <Route path="/join/:inviteCode" element={<JoinInvite />} />
        {/* Consultant onboarding + dashboard. localStorage-backed for now;
         * server-side bookings inbox will plug into ConsultantHome later. */}
        <Route path="/c" element={<Protected roles={["consultant"]}><ConsultantHome /></Protected>} />
        <Route path="/c/profile" element={<Protected roles={["consultant"]} allowRoleSetup><ConsultantProfile /></Protected>} />
        {/* HR-side bookings list — employer only (it's the "reviews I
         * commissioned" surface). */}
        <Route path="/bookings" element={<Protected roles={["employer"]}><MyBookings /></Protected>} />
        {/* Admin vetting surface. The real gate is SERVER-SIDE: the
         * admin-queue / admin-review endpoints check the caller's email
         * against the server-only DRAFTHR_ADMIN_EMAILS allowlist
         * (api/_utils/admin.ts) and fail closed. <Protected> only ensures
         * a session; a non-admin who loads this route gets a 403 from the
         * API and ConsultantAdminReview redirects them home. */}
        <Route path="/admin/consultants" element={<Protected><ConsultantAdminReview /></Protected>} />
        {/* Matter-scoped consultant review surface — consultant only. */}
        <Route path="/c/review/:bookingId" element={<Protected roles={["consultant"]}><SharedDraftReview /></Protected>} />
        {/* Internal component gallery — dev builds only. Shipping it to
         * prod exposed an internal surface to every signed-in user. */}
        {import.meta.env.DEV && (
          <Route path="/mockups" element={<Protected><Mockups /></Protected>} />
        )}
        {/* /consultants is auth-gated like the rest of the app. (It was
         * briefly public for "browse before signup"; reverted — a public
         * route that still shows the logged-in shell read as insecure and
         * wasn't worth the confusion.) */}
        {/* Marketplace — employer (books reviewers) and consultant (views
         * how they're listed). Not the employee surface. */}
        <Route
          path="/consultants"
          element={
            <Protected roles={["employer", "consultant"]}>
              <Suspense fallback={<AppLoadingScreen scope="page" />}>
                <ConsultantsIndex />
              </Suspense>
            </Protected>
          }
        />
        {/* Plans & pricing — any signed-in user can pick a plan or buy a SKU. */}
        <Route
          path="/pricing"
          element={
            <Protected>
              <Suspense fallback={<AppLoadingScreen scope="page" />}>
                <Pricing />
              </Suspense>
            </Protected>
          }
        />
        {/* Mobile read-only view. Stays inside the auth tree — Protected
         * gates it the same way /editor/:draftId is gated. The Layout
         * detects "/m/" as chromeless so the sidebar / topbar don't
         * render. */}
        <Route
          path="/m/:draftId"
          element={
            <Protected>
              <Suspense fallback={<AppLoadingScreen scope="page" />}>
                <MobileReadView />
              </Suspense>
            </Protected>
          }
        />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
      </div>
    </Layout>
  );
}
