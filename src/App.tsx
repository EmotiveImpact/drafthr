import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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
import { EvidenceStep } from "@/routes/EvidenceStep";
import { ReviewStep } from "@/routes/ReviewStep";
import { MattersIndex } from "@/routes/MattersIndex";
import { MatterDetail } from "@/routes/MatterDetail";
import { Layout } from "@/components/Layout";
import { Protected } from "@/lib/auth/Protected";
import { Skeleton } from "@/components/ui/skeleton";

// Editor pulls in Tiptap + extensions + draft orchestrator (~600 KB gzipped).
// Lazy-load so the home/landing/wizard routes stay snappy.
const Editor = lazy(() =>
  import("@/routes/Editor").then((m) => ({ default: m.Editor }))
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
  return (
    <Layout>
      <Routes>
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
        <Route path="/editor/:draftId/evidence" element={<Protected><EvidenceStep /></Protected>} />
        <Route path="/editor/:draftId/review" element={<Protected><ReviewStep /></Protected>} />
        <Route path="/matters" element={<Protected><MattersIndex /></Protected>} />
        <Route path="/matters/:matterId" element={<Protected><MatterDetail /></Protected>} />

        <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
        <Route path="/exported" element={<Protected><Exported /></Protected>} />
        <Route path="/activity" element={<Protected><Activity /></Protected>} />
        <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/mockups" element={<Protected><Mockups /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
