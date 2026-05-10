import { Navigate } from "react-router-dom";
import { useProfileStore } from "@/lib/profile";
import { ModePicker } from "./ModePicker";

/**
 * Smart-routes the root path:
 *   - First-run users (no role chosen yet) → ModePicker
 *   - Returning users → their role's home (`/hr` or `/me`)
 *
 * Users can always reach the picker via Settings → Change role.
 */
export function RootRedirect() {
  const profile = useProfileStore((s) => s.profile);
  if (profile.role === "employer") return <Navigate to="/hr" replace />;
  if (profile.role === "employee") return <Navigate to="/me" replace />;
  return <ModePicker />;
}
