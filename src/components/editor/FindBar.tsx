import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

/**
 * Find in letter (Search in the ribbon, Ctrl or Cmd+F). Matches are painted
 * with the CSS Custom Highlight API, so the editors' text is never touched;
 * Enter and Shift+Enter step through them.
 */
type HighlightRegistry = { set: (k: string, v: unknown) => void; delete: (k: string) => void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

function registry(): { reg: HighlightRegistry; Ctor: HighlightCtor } | null {
  const css = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
  if (!css?.highlights || !Ctor) return null;
  return { reg: css.highlights, Ctor };
}

function findRanges(root: HTMLElement, query: string): Range[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest("button, [aria-hidden='true'], .sr-only, del[data-status='pending']")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const text = (n.textContent ?? "").toLowerCase();
    let i = text.indexOf(q);
    while (i >= 0) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + q.length);
      out.push(r);
      i = text.indexOf(q, i + q.length);
    }
  }
  return out;
}

export function FindBar({
  open,
  onClose,
  rootRef,
  version,
}: {
  open: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLElement | null>;
  /** Changes when the letter changes, to search again. */
  version: unknown;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.select());
  }, [open]);

  const ranges = useMemo(() => {
    if (!open || !rootRef.current) return [] as Range[];
    return findRanges(rootRef.current, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, version, rootRef]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  useEffect(() => {
    const r = registry();
    if (!r) return;
    if (!open || ranges.length === 0) {
      r.reg.delete("lw-find");
      r.reg.delete("lw-find-current");
      return;
    }
    const cur = ranges[Math.min(idx, ranges.length - 1)];
    r.reg.set("lw-find", new r.Ctor(...ranges));
    r.reg.set("lw-find-current", new r.Ctor(cur));
    const el = cur.startContainer.parentElement;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => {
      r.reg.delete("lw-find");
      r.reg.delete("lw-find-current");
    };
  }, [open, ranges, idx]);

  if (!open) return null;
  const total = ranges.length;
  const step = (d: number) => total && setIdx((i) => (i + d + total) % total);

  return (
    <div
      role="search"
      aria-label="Find in letter"
      className="ds-rise-in absolute right-4 top-3 z-30 flex items-center gap-1 rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface)] py-1 pl-2.5 pr-1 shadow-[var(--ds-shadow-m)]"
    >
      <Search aria-hidden className="size-4 text-[var(--ds-subtle)]" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in letter"
        aria-label="Find in letter"
        className="h-7 w-[180px] bg-transparent px-1 text-[13.5px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-subtle)]"
      />
      <span className="ds-mono min-w-[52px] text-right text-[12px] text-[var(--ds-subtle)]" aria-live="polite">
        {q.trim() ? (total ? `${Math.min(idx, total - 1) + 1} of ${total}` : "No match") : ""}
      </span>
      <FindBtn label="Previous match" onClick={() => step(-1)} disabled={!total}>
        <ChevronUp className="size-4" />
      </FindBtn>
      <FindBtn label="Next match" onClick={() => step(1)} disabled={!total}>
        <ChevronDown className="size-4" />
      </FindBtn>
      <FindBtn label="Close find" onClick={onClose}>
        <X className="size-4" />
      </FindBtn>
    </div>
  );
}

function FindBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-[7px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] disabled:text-[var(--ds-faint)] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
    >
      {children}
    </button>
  );
}
