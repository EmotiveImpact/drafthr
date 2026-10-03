/** Request pins are consistency checks, never substitutes for session and
 * membership authorization. Optional for older callers; current UI sends both.
 */
export function enforceWorkspacePin(req: Request, tenantId: string, accountId: string): Response | null {
  const workspace = req.headers.get("X-Workspace-ID");
  const account = req.headers.get("X-Account-ID");
  if ((workspace !== null && workspace !== tenantId) || (account !== null && account !== accountId)) {
    return Response.json({ error: "Your account or workspace changed. Reload before continuing.", code: "workspace_changed" },
      { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}
