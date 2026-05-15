import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useProfileStore } from "@/lib/profile";
import { migrateEmployerImages } from "@/lib/storage/migrate";
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
import { SignIn } from "@/routes/SignIn";
import { AuthCallback } from "@/routes/AuthCallback";
import { Layout } from "@/components/Layout";
import { Protected } from "@/lib/auth/Protected";
import { Skeleton } from "@/components/ui/skeleton";

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
  // Editor routes are exempted from the page transition. The editor has
  // its own internal animations (rails, sheet, streaming) and a fade on
  // top of that double-animates and looks busy.
  const skipTransition = location.pathname.startsWith("/editor/");
  return (
    <Layout>
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
            <Route path="/" element={<Protected><RootRedirect /></Protected>} />
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

        <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
        <Route path="/exported" element={<Protected><Exported /></Protected>} />
        <Route path="/activity" element={<Protected><Activity /></Protected>} />
        <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/mockups" element={<Protected><Mockups /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
