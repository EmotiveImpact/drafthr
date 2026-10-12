/**
 * Home's assistant box (design 3A). It is the front door to the existing
 * new-letter flow: type what you need and DraftHR matches it to a letter
 * type from the catalogue; sending (or picking a suggestion) opens that
 * letter's wizard, and a request with no match opens the full template
 * browser. Nothing is sent anywhere from here.
 */
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUp, Library } from "lucide-react";
import type { Jurisdiction, Mode } from "@/lib/letters/types";
import { letterCatalogByMode, type LetterTypeMeta } from "@/lib/letters/catalog";
import { cn } from "@/lib/utils";

const STOP = new Set([
  "a", "an", "and", "the", "to", "for", "of", "on", "in", "my", "me", "i", "we", "our", "their",
  "about", "with", "from", "that", "this", "need", "want", "write", "draft", "letter", "please",
  "can", "you", "help", "an", "is", "be", "it", "his", "her", "them", "someone", "employee",
]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Loose stem: "warnings" ~ "warning" ~ "warn". */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length, 6);
  return n >= 4 && a.slice(0, n) === b.slice(0, n);
}

/** Rank catalogue entries against free text. Title hits weigh more. */
export function matchLetters(query: string, catalog: LetterTypeMeta[]): LetterTypeMeta[] {
  const q = words(query);
  if (q.length === 0) return [];
  const scored = catalog.map((l) => {
    const short = words(l.shortTitle);
    const title = words(l.title);
    const desc = words(l.description);
    let score = 0;
    for (const w of q) {
      if (short.some((t) => near(w, t))) score += 4;
      else if (title.some((t) => near(w, t))) score += 3;
      else if (desc.some((t) => near(w, t))) score += 1;
    }
    return { l, score };
  });
  return scored
    .filter((s) => s.score >= 3 || (q.length === 1 && s.score >= 1))
    .sort((a, b) => b.score - a.score || Number(b.l.flagshipV1) - Number(a.l.flagshipV1))
    .map((s) => s.l);
}

export function AssistantBox({
  mode,
  jurisdiction,
  className,
}: {
  mode: Mode;
  jurisdiction: Jurisdiction;
  className?: string;
}) {
  const nav = useNavigate();
  const prefix = mode === "employer" ? "/hr" : "/me";
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);

  // Same jurisdiction scoping as the template browser.
  const catalog = useMemo(
    () =>
      letterCatalogByMode(mode).filter(
        (l) =>
          !(l.jurisdictionScope === "uk_only" && jurisdiction !== "UK") &&
          !(l.jurisdictionScope === "us_only" && jurisdiction !== "US")
      ),
    [mode, jurisdiction]
  );
  const starters = useMemo(() => catalog.filter((l) => l.flagshipV1).slice(0, 4), [catalog]);
  const matches = useMemo(() => matchLetters(text, catalog).slice(0, 4), [text, catalog]);

  const typing = text.trim().length > 0;
  const suggestions = typing ? matches : starters;

  const start = (id?: string) => nav(id ? `${prefix}/new/${id}` : `${prefix}/new`);
  const send = () => {
    if (!typing) return;
    start(matches[0]?.id);
  };

  const placeholder =
    mode === "employer"
      ? "Describe the letter you need, for example a final written warning for lateness"
      : "Describe your situation, for example raising a grievance about my manager";

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div
        className="flex cursor-text flex-col gap-3.5 rounded-[var(--ds-r-l)] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-4 pt-[18px] pb-3 transition focus-within:border-[var(--ds-line-strong)] focus-within:shadow-[var(--ds-shadow-s)] sm:pl-[18px]"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("a,button")) ta.current?.focus();
        }}
      >
        <label htmlFor="home-assistant" className="sr-only">
          Ask DraftHR to start a letter
        </label>
        <textarea
          id="home-assistant"
          ref={ta}
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          className="block min-h-[44px] w-full resize-none border-0 bg-transparent px-0.5 text-[15px] leading-[22px] text-[var(--ds-ink)] outline-none placeholder:text-[var(--ds-muted)]"
        />
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="-ml-1.5 flex min-w-0 items-center gap-0.5 overflow-hidden">
            <Link
              to={`${prefix}/new`}
              className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[var(--ds-r-s)] px-2 text-[13px] font-medium text-[var(--ds-muted)] transition hover:bg-[var(--ds-surface-3)] hover:text-[var(--ds-ink)]"
            >
              <Library className="size-[15px]" />
              Templates
            </Link>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={!typing}
            aria-label={matches[0] ? `Start ${matches[0].shortTitle}` : "Browse letter types"}
            title={typing ? (matches[0] ? `Start ${matches[0].shortTitle}` : "Browse letter types") : undefined}
            className="grid size-8 shrink-0 place-items-center rounded-[var(--ds-r-s)] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] transition hover:bg-[var(--ds-accent-hover)] disabled:cursor-default disabled:opacity-[0.28] disabled:hover:bg-[var(--ds-accent)]"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>

      {/* Suggestions: common letters before typing, best matches while typing. */}
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" aria-live="polite">
        <span className="mr-1 text-[12.5px] text-[var(--ds-muted)]">
          {typing ? (matches.length > 0 ? "Best match" : "No close match.") : "Try"}
        </span>
        {suggestions.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => start(l.id)}
            className={cn(
              "inline-flex h-7 max-w-full items-center truncate rounded-full border px-2.5 text-[12.5px] font-medium transition",
              typing && i === 0
                ? "border-[var(--ds-line-strong)] bg-[var(--ds-surface)] text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                : "border-[var(--ds-line)] bg-transparent text-[var(--ds-body)] hover:border-[var(--ds-line-strong)] hover:bg-[var(--ds-surface)] hover:text-[var(--ds-ink)]"
            )}
          >
            <span className="truncate">{l.shortTitle}</span>
          </button>
        ))}
        {typing && matches.length === 0 && (
          <button
            type="button"
            onClick={() => start()}
            className="text-[12.5px] font-medium text-[var(--ds-ink)] underline-offset-2 hover:underline"
          >
            Browse all letter types
          </button>
        )}
      </div>
    </div>
  );
}
