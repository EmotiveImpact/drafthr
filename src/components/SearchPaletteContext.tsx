import { createContext, useContext } from "react";

type Ctx = { open: boolean; setOpen: (v: boolean | ((prev: boolean) => boolean)) => void };

export const SearchPaletteContext = createContext<Ctx | null>(null);

export function useSearchPaletteToggle() {
  const ctx = useContext(SearchPaletteContext);
  if (!ctx) throw new Error("SearchPaletteContext missing");
  return ctx;
}
