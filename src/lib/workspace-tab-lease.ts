type TabStorage = Pick<Storage, "getItem" | "setItem">;
type Locks = Pick<LockManager, "request">;
export type WorkspaceTabLease = { id: string; release: () => Promise<void> };

/** Hold every source lease through the durable transfer. An ifAvailable lock
 * fails immediately for an open tab or competing recovery, rather than waiting
 * and later importing a source different from the one the user reviewed. */
export async function withClosedWorkspaceTabs<T>(ids: string[], locks: Locks | undefined, work: () => Promise<T>): Promise<T> {
  if (!locks) throw new Error("Safe closed-tab recovery needs Web Locks support. Download the recovery copies; no originals have been changed.");
  const ordered = [...new Set(ids)].sort();
  const acquire = async (index: number): Promise<T> => {
    if (index === ordered.length) return work();
    return locks.request(`drafthr-workspace-tab:${ordered[index]}`, { ifAvailable: true }, lock => {
      if (!lock) throw new Error("An older tab is still open or another tab is recovering these edits. Close the older tab and retry; its recovery copy is unchanged.");
      return acquire(index + 1);
    });
  };
  return acquire(0);
}

/** Duplicating a tab copies sessionStorage. An exclusive page-lifetime lock
 * prevents those tabs from sharing (and overwriting) one pending-edit file.
 * Without Web Locks, use a fresh recovery file and offer explicit recovery of
 * the previous file, rather than risk an ambiguous automatic takeover.
 */
export async function claimWorkspaceTab(storage: TabStorage, locks?: Locks): Promise<WorkspaceTabLease> {
  let candidate = locks ? storage.getItem("drafthr.workspace-tab.v1") : null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = candidate || crypto.randomUUID();
    if (!locks) { storage.setItem("drafthr.workspace-tab.v1", id); return { id, release: async () => {} }; }
    const lease = await new Promise<WorkspaceTabLease | null>((resolve, reject) => {
      const completed = locks.request(`drafthr-workspace-tab:${id}`, { ifAvailable: true }, lock => {
        if (!lock) { resolve(null); return; }
        return new Promise<void>(release => { resolve({ id, release: async () => { release(); await completed; } }); });
      });
      void completed.catch(reject);
    });
    if (lease) {
      try { storage.setItem("drafthr.workspace-tab.v1", id); } catch (error) { await lease.release(); throw error; }
      return lease;
    }
    candidate = null;
  }
  throw new Error("Could not isolate this tab's pending changes. Close duplicate tabs and try again.");
}
