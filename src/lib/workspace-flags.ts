/** Both client and server flags must be enabled together, after migrations. */
export function isDatabaseWorkspaceEnabled(): boolean {
  return import.meta.env?.VITE_DRAFTHR_DATABASE_WORKSPACE === "true";
}
