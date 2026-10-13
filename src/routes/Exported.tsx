import { Navigate } from "react-router-dom";

/**
 * The old Sent letters page. Sent letters now live on the Letters page's
 * Sent tab, so `/exported` (sidebar history, the search palette's
 * "Exported" entry, old links) lands there.
 */
export function Exported() {
  return <Navigate to="/letters?tab=sent" replace />;
}
