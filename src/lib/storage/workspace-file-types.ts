export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
export const EXPORT_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  pack: "application/zip",
} as const;
export type ArtifactFormat = keyof typeof EXPORT_MIME;
export const EVIDENCE_MIME = new Set([
  "application/pdf", EXPORT_MIME.docx, "text/plain", "text/csv", "text/markdown",
  "message/rfc822", "text/calendar", "image/png", "image/jpeg", "image/webp", "image/gif",
]);
export type WorkspaceFile = {
  id: string; draftId: string; purpose: "evidence" | "export";
  format: ArtifactFormat | null; filename: string; contentType: string;
  size: number; sha256: string; draftRevision: number; createdAt: number; completedAt: number;
  title?: string; recipient?: string;
};
export function workspaceFileUrl(id: string, tenantId: string): string {
  return `/api/store/files?id=${encodeURIComponent(id)}&workspaceId=${encodeURIComponent(tenantId)}`;
}

/** Only this authenticated, tenant-pinned route is a valid private inline image.
 * Do not widen this to arbitrary relative URLs or external image hosts. */
export function parseWorkspaceFileUrl(value: string): { id: string; tenantId: string } | null {
  if (!value.startsWith("/api/store/files?") || value.includes("#")) return null;
  const query = new URLSearchParams(value.slice("/api/store/files?".length));
  if ([...query.keys()].length !== 2) return null;
  const id = query.get("id"), tenantId = query.get("workspaceId");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return id && tenantId && uuid.test(id) && uuid.test(tenantId) ? { id, tenantId } : null;
}
