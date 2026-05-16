import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Theme: locked to "light" until the product justifies a dark mode pass
 * (which is non-trivial — the design system tokens are currently light-only
 * and dark mode produced contrast bugs in the editor + the AI rail).
 *
 * The store keeps the same shape for backwards compat (the avatar menu has
 * been pruned of dark/system options, but other surfaces may still call
 * setMode). Any call to setMode is now a no-op that re-applies "light".
 */
export type ThemeMode = "light";

type Store = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<Store>()(
  persist(
    (set) => ({
      mode: "light",
      setMode: () => {
        set({ mode: "light" });
        applyTheme();
      },
    }),
    {
      name: "scribehr-theme-v1",
      onRehydrateStorage: () => () => {
        // Always apply light on rehydrate — defends against legacy persisted "dark"
        // entries from before this lock-down.
        applyTheme();
      },
    }
  )
);

/** Removes any leftover `dark` class so the app paints in light tokens. */
export function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark");
}

/** Apply on app boot before React renders, defending against any legacy
 * persisted dark-mode setting. */
export function bootstrapTheme() {
  applyTheme();
}
