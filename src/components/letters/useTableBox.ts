import { useLayoutEffect, useRef, useState } from "react";

/**
 * A list table's box (where its text is measured, see makeMeasure in
 * tableLayout.ts) and its width, read before paint and again whenever it
 * changes. Width 0 until laid out. `fonts` ticks once the web font has
 * loaded, so widths measured in a fallback font are worked out again.
 */
export function useTableBox<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ width: number; host: HTMLElement | null; fonts: number }>({ width: 0, host: null, fonts: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const width = Math.floor(el.clientWidth);
      setBox((b) => (b.width === width && b.host === el ? b : { ...b, width, host: el }));
    };
    read();
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) setBox((b) => ({ ...b, fonts: b.fonts + 1 }));
    });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    ro?.observe(el);
    return () => {
      live = false;
      ro?.disconnect();
    };
  }, []);
  return { ref, ...box };
}
