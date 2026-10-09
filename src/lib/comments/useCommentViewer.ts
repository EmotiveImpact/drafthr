import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";
import type { CommentViewer } from "./identity";

/** The signed-in user and their workspace role, for comment authorship. */
export function useCommentViewer(): CommentViewer {
  const { user, activeTenant } = useAuth();
  const profileRole = useProfileStore((s) => s.profile.workspaceRole);
  const userId = user?.id ?? null;
  const role = activeTenant?.role ?? profileRole ?? null;
  return useMemo(() => ({ userId, role }), [userId, role]);
}
