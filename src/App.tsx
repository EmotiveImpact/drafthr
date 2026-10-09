import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useProfileStore, type WorkspaceRole } from "@/lib/profile";
import { migrateEmployerImages } from "@/lib/storage/migrate";
import { useDraftStore } from "@/lib/store";
import {
  isDualWriteEnabled,
  pauseDualWrite,
  persistedDraftTombstones,
  reissuePendingDeletes,
  syncAllPending,
} from "@/lib/dual-write";
import {
  pullRemoteDrafts,
  mergeRemoteDrafts,
  pullRemoteExtras,
  mergeRemoteExtras,
  type SyncMetaAccess,
} from "@/lib/remote-pull";
import {
  clearSyncMeta,
  draftContentKey,
  draftSyncKey,
  getSyncMeta,
  patchSyncMeta,
  setSyncMeta,
} from "@/lib/sync-meta";
import { useAuth } from "@/lib/auth";
import { StorageQuotaBanner } from "@/components/StorageQuotaBanner";
import { LocalDataLossDialog } from "@/components/LocalDataLossDialog";
import {
  clearTenantScopedLocalData,
  localNamespace,
  readLocalOwner,
  reconcileLocalDataOwner,
  switchLocalWorkspace,
} from "@/lib/session/clearLocalData";
import { confirmLocalDataLoss } from "@/lib/session/localDataGuard";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { RootRedirect } from "@/routes/RootRedirect";
import { PaywallGate } from "@/components/billing/PaywallGate";
// Every route is its own chunk (React.lazy) so the first paint only pays for
// the shell (Layout, auth, router) plus the route actually being shown.
// Previously ~30 routes were imported eagerly, which dragged the editor
// stack, the paged view and every letter template into the entry chunk.
function lazyNamed<M, K extends keyof M & string>(load: () => Promise<M>, name: K): M[K] {
  return lazy(() =>
    load().then((m) => ({ default: m[name] as unknown as ComponentType<Record<string, unknown>> })),
  ) as unknown as M[K];
}
const Home = lazyNamed(() => import("@/routes/Home"), "Home");
const Wizard = lazyNamed(() => import("@/routes/Wizard"), "Wizard");
// ModePicker stays eager: RootRedirect (the landing route) renders it inline.
import { ModePicker } from "@/routes/ModePicker";
const Settings = lazyNamed(() => import("@/routes/Settings"), "Settings");
const SettingsDirectorySync = lazyNamed(() => import("@/routes/settings/DirectorySync"), "DirectorySync");
const Privacy = lazyNamed(() => import("@/routes/Privacy"), "Privacy");
const Terms = lazyNamed(() => import("@/routes/Terms"), "Terms");
const BrowseLetters = lazyNamed(() => import("@/routes/BrowseLetters"), "BrowseLetters");
const ReviewStep = lazyNamed(() => import("@/routes/ReviewStep"), "ReviewStep");
const MattersIndex = lazyNamed(() => import("@/routes/MattersIndex"), "MattersIndex");
const EmployeesIndex = lazyNamed(() => import("@/routes/EmployeesIndex"), "EmployeesIndex");
const Approvals = lazyNamed(() => import("@/routes/Approvals"), "Approvals");
const MatterDrillDown = lazyNamed(() => import("@/components/reports/MatterDrillDown"), "MatterDrillDown");
const FailingCheckDrillDown = lazyNamed(() => import("@/components/reports/FailingCheckDrillDown"), "FailingCheckDrillDown");
const SignIn = lazyNamed(() => import("@/routes/SignIn"), "SignIn");
const SignUp = lazyNamed(() => import("@/routes/SignUp"), "SignUp");
const ForgotPassword = lazyNamed(() => import("@/routes/ForgotPassword"), "ForgotPassword");
const ResetPassword = lazyNamed(() => import("@/routes/ResetPassword"), "ResetPassword");
const VerifyEmail = lazyNamed(() => import("@/routes/VerifyEmail"), "VerifyEmail");
const AuthCallback = lazyNamed(() => import("@/routes/AuthCallback"), "AuthCallback");
const SignupWorkspace = lazyNamed(() => import("@/routes/SignupWorkspace"), "SignupWorkspace");
const JoinInvite = lazyNamed(() => import("@/routes/JoinInvite"), "JoinInvite");
const ConsultantHome = lazyNamed(() => import("@/routes/ConsultantHome"), "ConsultantHome");
const ConsultantProfile = lazyNamed(() => import("@/routes/ConsultantProfile"), "ConsultantProfile");
const MyBookings = lazyNamed(() => import("@/routes/MyBookings"), "MyBookings");
const ConsultantAdminReview = lazyNamed(() => import("@/routes/ConsultantAdminReview"), "ConsultantAdminReview");
const SharedDraftReview = lazyNamed(() => import("@/routes/SharedDraftReview"), "SharedDraftReview");
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
import { Layout } from "@/components/Layout";
import { NotFound } from "@/routes/NotFound";
import { Protected } from "@/lib/auth/Protected";
import { Skeleton } from "@/components/ui/skeleton";
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

function EditorFallback() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-6 gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-[400px] w-full" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}

// Revision bookkeeping for the cross-device pull (see src/lib/sync-meta.ts).
const SYNC_META_ACCESS: SyncMetaAccess = {
  get: getSyncMeta,
  adopted: (localId, revision, draft) =>
    setSyncMeta(localId, {
      rev: revision,
      key: draftSyncKey(draft),
      ckey: draftContentKey(draft),
      ekey: getSyncMeta(localId)?.ekey,
      at: Date.now(),
    }),
  rebased: (localId, revision) => patchSyncMeta(localId, { rev: revision }),
  clear: clearSyncMeta,
};

/** Set when the local data was just swapped for another workspace's: the
 *  in-memory store is stale until the reload, so nothing may sync it. */
let localDataReloadPending = false;

export function App() {
  const location = useLocation();
  const { activeTenant, isLoaded, user } = useAuth();
  // Make sure the local data on this device belongs to this user and
  // workspace before anything syncs it. Data left by another workspace (or a
  // user who didn't sign out) is stashed under its owner, not shown here and
  // not deleted; this workspace's own stash comes back after a reload.
  // Declared first so it runs before the sync effects below in each commit.
  useEffect(() => {
    if (!isLoaded || !user || !activeTenant) return;
    if (reconcileLocalDataOwner(user.id, activeTenant.id)) {
      localDataReloadPending = true;
      window.location.reload();
      return;
    }
    const ns = localNamespace(user.id, activeTenant.id);
    const owner = readLocalOwner();
    if (owner === null || owner === ns) return;
    // Another workspace's (or user's) data is still live because there was
    // no room to stash it. Never push or pull it into this workspace; offer
    // to delete it from this device (with a backup) instead.
    localDataReloadPending = true;
    pauseDualWrite();
    void confirmLocalDataLoss("switch").then((proceed) => {
      if (!proceed) return;
      clearTenantScopedLocalData({ keepProfile: true });
      switchLocalWorkspace(null, ns);
      window.location.reload();
    });
  }, [isLoaded, user, activeTenant]);
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

  // Cross-device PULL — when the flag is on AND the user has an active tenant,
  // fetch the tenant's drafts from the server and merge them into the local
  // store so a second device / teammate sees the same letters. The merge is
  // non-destructive (preserves newer local edits + all local-only fields).
  //
  // Then the dual-write backfill: POST every locally-known draft that changed
  // since its last successful sync. It runs after the pull so each draft's
  // server revision is known first; pushed before it (as on the first load
  // after the revision upgrade, with no sync metadata yet) every draft drew a
  // 409 and anything changed elsewhere came back as a conflicted copy.
  useEffect(() => {
    if (!isLoaded || !activeTenant || !isDualWriteEnabled() || localDataReloadPending) return;
    let cancelled = false;
    void (async () => {
      // Retry deletes that never got a confirmed 2xx (tab closed / offline)
      // BEFORE pulling, so a pending-delete row is gone rather than merged.
      await reissuePendingDeletes();
      if (cancelled) return;
      await pullRemoteDrafts((remote, deleted) => {
        if (cancelled) return;
        // Re-read the live store at apply time so a concurrent edit isn't lost.
        // Skip adoption of rows whose delete is still unconfirmed (BUG-05),
        // and drop drafts deleted on another device (server tombstones).
        const local = useDraftStore.getState().drafts;
        useDraftStore.setState({
          drafts: mergeRemoteDrafts(local, remote, persistedDraftTombstones(), {
            deleted,
            syncMeta: SYNC_META_ACCESS,
            syncKey: draftSyncKey,
            onKeptLocalOnly: () =>
              toast.warning("A letter was deleted on another device", {
                description: "Your unsaved changes to it are kept on this device only.",
              }),
          }),
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
      if (cancelled || Object.keys(useDraftStore.getState().drafts).length === 0) return;
      const result = await syncAllPending(() => Object.values(useDraftStore.getState().drafts));
      if (cancelled) return;
      if (result.ok > 0) {
        toast.success(`${result.ok} draft${result.ok === 1 ? "" : "s"} synced to your workspace.`);
      }
      if (result.failed > 0) {
        console.warn(`[dual-write] backfill: ${result.failed} drafts failed to sync`);
      }
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
  // Editor routes are exempted from the page transition. The editor has
  // its own internal animations (rails, sheet, streaming) and a fade on
  // top of that double-animates and looks busy.
  const skipTransition = location.pathname.startsWith("/editor/");
  // Onboarding tour gate — only on the first signed-in landing inside the
  // app (/hr or /me). Skip until the user has a workspace AND a role so the
  // sidebar anchors actually exist.
  const onTourSurface =
    location.pathname.startsWith("/hr") || location.pathname.startsWith("/me");
  const showTour =
    isLoaded &&
    !!user &&
    !!activeTenant &&
    onTourSurface &&
    !hasSeenTour();
  return (
    <Layout>
      <StorageQuotaBanner />
      <LocalDataLossDialog />
      {showTour && (
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={skipTransition ? "editor" : location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{
            duration: 0.18,
            ease: [0.32, 0.72, 0, 1],
          }}
          className="h-full flex flex-col flex-1 min-h-0"
        >
          {/* One Suspense boundary for all lazy routes (I-PERF-1). Inner
           * per-route boundaries (editor/evidence/etc.) still apply too. */}
          <Suspense fallback={<EditorFallback />}>
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
              <Suspense fallback={<EditorFallback />}>
                <Editor />
              </Suspense>
            </Protected>
          }
        />
        <Route
          path="/editor/:draftId/evidence"
          element={
            <Protected>
              <Suspense fallback={<EditorFallback />}>
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
        <Route path="/c/profile" element={<Protected roles={["consultant"]}><ConsultantProfile /></Protected>} />
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
              <Suspense fallback={<EditorFallback />}>
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
              <Suspense fallback={<EditorFallback />}>
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
              <Suspense fallback={<EditorFallback />}>
                <MobileReadView />
              </Suspense>
            </Protected>
          }
        />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
