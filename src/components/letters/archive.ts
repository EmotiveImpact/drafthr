import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Archived letters (the Letters page bulk "Archive" action).
 *
 * The draft store has no archive flag for letters, so the archive is a small
 * list of draft ids kept on this device. An archived letter leaves the All,
 * Needs you, In review, Approval and Sent tabs and shows under "Archived" on
 * the Letters page, where it can be restored. Nothing about the letter itself
 * changes: it still opens, exports and syncs as before.
 */
type ArchiveStore = {
  /** draft id -> when it was archived. */
  archived: Record<string, number>;
  archive: (ids: string[]) => void;
  restore: (ids: string[]) => void;
};

export const useLetterArchive = create<ArchiveStore>()(
  persist(
    (set) => ({
      archived: {},
      archive: (ids) =>
        set((s) => {
          const next = { ...s.archived };
          const now = Date.now();
          for (const id of ids) next[id] = next[id] ?? now;
          return { archived: next };
        }),
      restore: (ids) =>
        set((s) => {
          const next = { ...s.archived };
          for (const id of ids) delete next[id];
          return { archived: next };
        }),
    }),
    { name: "drafthr.letters.archived.v1", version: 1 }
  )
);
