import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useProfileStore } from "@/lib/profile";
import { migrateEmployerImages } from "@/lib/storage/migrate";
import { useDraftStore } from "@/lib/store";
import { isDualWriteEnabled, syncAllPending } from "@/lib/dual-write";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Home } from "@/routes/Home";
import { Wizard } from "@/routes/Wizard";
import { RootRedirect } from "@/routes/RootRedirect";
import { ModePicker } from "@/routes/ModePicker";
import { Settings } from "@/routes/Settings";
import { Privacy } from "@/routes/Privacy";
import { Mockups } from "@/routes/Mockups";
import { BrowseLetters } from "@/routes/BrowseLetters";
import { Calendar } from "@/routes/Calendar";
import { Exported } from "@/routes/Exported";
import { Activity } from "@/routes/Activity";
import { Notifications } from "@/routes/Notifications";
import { ReviewStep } from "@/routes/ReviewStep";
import { Finalize } from "@/routes/Finalize";
import { MattersIndex } from "@/routes/MattersIndex";
import { MatterDetail } from "@/routes/MatterDetail";
import { EmployeesIndex } from "@/routes/EmployeesIndex";
import { EmployeeDetail } from "@/routes/EmployeeDetail";
import BulkOperations from "@/routes/BulkOperations";
import { Approvals } from "@/routes/Approvals";
import { Reports } from "@/routes/Reports";
import { SignIn } from "@/routes/SignIn";
import { AuthCallback } from "@/routes/AuthCallback";
import { SignupWorkspace } from "@/routes/SignupWorkspace";
import { JoinInvite } from "@/routes/JoinInvite";
import { Layout } from "@/components/Layout";
import { Protected } from "@/lib/auth/Protected";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
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

function EditorFallback() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-6 gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-[400px] w-full" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}

export function App() {
  const location = useLocation();
  const { activeTenant, isLoaded, user } = useAuth();
  // One-shot migration for existing base64 letterhead/signature → Blob URL.
  // Pre-migration users have ~700 KB+ of base64 sitting in localStorage; this
  // swaps them out lazily so the dual-write rollout doesn't carry those blobs
  // into Postgres. Idempotent: helper skips anything not already a data: URL.
  useEffect(() => {
    let cancelled = false;
    const { profile, patchEmployer } = useProfileStore.getState();
    void migrateEmployerImages(profile.employer).then((patch) => {
      if (!cancelled && patch) patchEmployer(patch);
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
      {showTour && <OnboardingTour />}
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
          <Routes location={location}>
            {/* / handles its own auth-state branching (signed-out landing,
             * tenant-less redirect, role-less ModePicker, fully-onboarded
             * route-to-home). Wrapping in <Protected> would trigger a
             * useEffect race and flash content from the previous state. */}
            <Route path="/" element={<RootRedirect />} />
        <Route path="/pick-role" element={<Protected><ModePicker /></Protected>} />

        <Route path="/hr" element={<Protected><Home mode="employer" /></Protected>} />
        <Route path="/hr/new" element={<Protected><BrowseLetters mode="employer" /></Protected>} />
        <Route path="/hr/new/:letterType" element={<Protected><Wizard mode="employer" /></Protected>} />

        <Route path="/me" element={<Protected><Home mode="employee" /></Protected>} />
        <Route path="/me/new" element={<Protected><BrowseLetters mode="employee" /></Protected>} />
        <Route path="/me/new/:letterType" element={<Protected><Wizard mode="employee" /></Protected>} />

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
        <Route path="/matters" element={<Protected><MattersIndex /></Protected>} />
        <Route path="/matters/:matterId" element={<Protected><MatterDetail /></Protected>} />
        <Route path="/employees" element={<Protected><EmployeesIndex /></Protected>} />
        <Route path="/employees/:employeeId" element={<Protected><EmployeeDetail /></Protected>} />
        <Route path="/bulk" element={<Protected><BulkOperations /></Protected>} />
        <Route path="/approvals" element={<Protected><Approvals /></Protected>} />
        <Route path="/reports" element={<Protected><Reports /></Protected>} />

        <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
        <Route path="/exported" element={<Protected><Exported /></Protected>} />
        <Route path="/activity" element={<Protected><Activity /></Protected>} />
        <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/signup/workspace" element={<Protected><SignupWorkspace /></Protected>} />
        <Route path="/join/:inviteCode" element={<JoinInvite />} />
        <Route path="/mockups" element={<Protected><Mockups /></Protected>} />
        <Route
          path="/consultants"
          element={
            <Protected>
              <Suspense fallback={<EditorFallback />}>
                <ConsultantsIndex />
              </Suspense>
            </Protected>
          }
        />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
