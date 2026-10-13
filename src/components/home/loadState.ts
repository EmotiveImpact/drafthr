/**
 * Whether the workspace's letters are still on their way. The app shell
 * (App.tsx) marks the first pull from the server; until it lands on a
 * device that has no letters yet, Home, its tabs and Reports show soft grey
 * placeholders instead of an empty state, then the rows fade in together.
 * A device that already has letters shows them at once (the pull merges
 * quietly), so nothing is ever held back to look busy.
 */
import { create } from "zustand";
import { useDraftStore } from "@/lib/store";

type LoadState = { pulling: boolean; setPulling: (pulling: boolean) => void };

export const useWorkspaceLoad = create<LoadState>()((set) => ({
  pulling: false,
  setPulling: (pulling) => set({ pulling }),
}));

/** True while the first pull is in flight and this device has no letters. */
export function useLettersLoading(): boolean {
  const pulling = useWorkspaceLoad((s) => s.pulling);
  const empty = useDraftStore((s) => Object.keys(s.drafts).length === 0);
  return pulling && empty;
}
