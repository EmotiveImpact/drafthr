import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

type Store = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<Store>()(
  persist(
    (set) => ({
      mode: "system",
      setMode: (mode) => {
        set({ mode });
        applyTheme(mode);
      },
    }),
    {
      name: "hr-letter-theme-v1",
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.mode);
      },
    }
  )
);

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", dark);
}

/** Apply the saved theme synchronously on app boot, before React renders. */
export function bootstrapTheme() {
  if (typeof document === "undefined") return;
  try {
    const raw = localStorage.getItem("hr-letter-theme-v1");
    const persisted = raw ? (JSON.parse(raw).state?.mode as ThemeMode | undefined) : undefined;
    applyTheme(persisted ?? "system");
  } catch {
    applyTheme("system");
  }
}
