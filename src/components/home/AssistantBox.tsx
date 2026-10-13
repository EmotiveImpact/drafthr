/**
 * Home's ask box (mock home `.ask`). It is the front door to the existing
 * new-letter flow: type what you need and DraftHR matches it to a letter
 * type from the catalogue; sending (or picking a suggestion) opens that
 * letter's wizard, and a request with no match opens the template browser.
 * Nothing is sent anywhere from here.
 *
 *   context chip   what DraftHR will use for the next letter (the
 *                  workspace's law and tone, from Settings, Defaults)
 *   +              a small menu: New letter, New matter, Browse templates
 *   Templates      the template browser
 *   Files          files go with a letter as its evidence: pick the letter
 *                  and its evidence page opens, where files are added
 *   sliders        law and tone for the next letter (saved as your defaults)
 *   send           start the best match
 */
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUp, FilePlus2, FolderPlus, LibraryBig, Paperclip, Plus, SlidersHorizontal } from "lucide-react";
import type { Jurisdiction, Mode } from "@/lib/letters/types";
import { letterCatalogByMode, type LetterTypeMeta } from "@/lib/letters/catalog";
import { useProfileStore } from "@/lib/profile";
import { useDraftStore } from "@/lib/store";
import { isSent } from "@/components/journey/send/record";
import { letterName, personFor } from "./homeData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const HR_TONES = [
  { id: "warm", label: "Warm" },
  { id: "neutral", label: "Neutral" },
  { id: "formal", label: "Formal" },
  { id: "firm", label: "Firm" },
] as const;

const EMPLOYEE_TONES = [
  { id: "conciliatory", label: "Conciliatory" },
  { id: "assertive", label: "Assertive" },
  { id: "forensic", label: "Forensic" },
  { id: "tribunal_ready", label: "Tribunal ready" },
] as const;

const ICON_BTN =
  "grid size-[30px] shrink-0 place-items-center rounded-[8px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] data-[state=open]:bg-[var(--ds-surface-2)] data-[state=open]:text-[var(--ds-ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)]";

const LINK_BTN =
  "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[8px] px-1.5 text-[13.5px] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)]";

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
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
  const defaults = useProfileStore((s) => s.profile.defaults);
  const patchDefaults = useProfileStore((s) => s.patchDefaults);
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
  const sendLabel = matches[0] ? `Start ${matches[0].shortTitle}` : "Browse letter types";

  const employer = mode === "employer";
  const tones = employer ? HR_TONES : EMPLOYEE_TONES;
  // With no saved default, the tone a new letter starts with (as the
  // letter's own tone menu shows it): formal for HR, assertive for employees.
  const tone = employer ? (defaults.tone ?? "formal") : (defaults.employeeTone ?? "assertive");
  const toneLabel = tones.find((t) => t.id === tone)?.label;
  const law =
    jurisdiction === "US"
      ? `US law${defaults.usState ? `, ${defaults.usState}` : ""}`
      : `UK law, ${defaults.ukRegion ?? "England & Wales"}`.replace("&", "and");
  const contextLine = toneLabel ? `${law}, ${toneLabel.toLowerCase()} tone` : law;

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div
        className="flex cursor-text flex-col rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3.5 pt-3.5 pb-3 shadow-[var(--ds-shadow-ask)] transition-colors duration-[120ms] focus-within:border-[var(--ds-line-strong)] md:px-[18px] md:pt-4 md:pb-3.5"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("a,button,[role=menu],[role=dialog]")) ta.current?.focus();
        }}
      >
        <Link
          to="/settings?tab=defaults"
          title="Change the law and tone DraftHR uses"
          className="inline-flex max-w-full items-center gap-2.5 self-start rounded-[10px] bg-[var(--ds-surface-2)] py-[7px] pr-3 pl-2.5 text-left transition-colors duration-[120ms] hover:bg-[var(--ds-surface-3)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ds-focus)] md:py-2"
        >
          <Paperclip className="size-[15px] shrink-0 text-[var(--ds-muted)]" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[13px] leading-tight font-medium text-[var(--ds-ink)]">
              {employer ? "Your policies" : "Your details"}
            </span>
            <span className="block truncate text-[12px] leading-tight text-[var(--ds-muted)]">{contextLine}</span>
          </span>
        </Link>

        <div className="relative mx-0.5 mt-3.5 mb-[18px] md:mt-4 md:mb-[22px]">
          <label htmlFor="home-assistant" className="sr-only">
            Ask DraftHR to start a letter
          </label>
          {!typing && (
            <p aria-hidden className="pointer-events-none absolute inset-0 m-0 text-[15px] leading-[1.4] text-[var(--ds-subtle)] md:text-[16px] md:leading-[24px]">
              {employer ? (
                <>
                  Describe the letter you need, for example{" "}
                  <span className="text-[var(--ds-ink)]">a final written warning for lateness</span>
                </>
              ) : (
                <>
                  Describe your situation, for example{" "}
                  <span className="text-[var(--ds-ink)]">raising a grievance about my manager</span>
                </>
              )}
            </p>
          )}
          <textarea
            id="home-assistant"
            ref={ta}
            rows={1}
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
            className="relative block min-h-[42px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.4] text-[var(--ds-ink)] outline-none md:min-h-[24px] md:text-[16px] md:leading-[24px]"
          />
        </div>

        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <DropdownMenu>
            <Tip label="Start something new">
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Start something new" className={cn(ICON_BTN, "-ml-1.5")}>
                  <Plus className="size-[17px]" aria-hidden />
                </button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="start" className="w-[210px]">
              <DropdownMenuItem onSelect={() => nav(`${prefix}/new`)}>
                <FilePlus2 aria-hidden />
                New letter
              </DropdownMenuItem>
              {employer && (
                <DropdownMenuItem onSelect={() => nav("/matters")}>
                  <FolderPlus aria-hidden />
                  New matter
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => nav(`${prefix}/new`)}>
                <LibraryBig aria-hidden />
                Browse templates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to={`${prefix}/new`} className={LINK_BTN}>
            <LibraryBig className="size-[15px]" aria-hidden />
            Templates
          </Link>
          <FilesButton mode={mode} prefix={prefix} />
          <span className="flex-1" />
          <Popover>
            <Tip label="Law and tone">
              <PopoverTrigger asChild>
                <button type="button" aria-label="Law and tone for the next letter" className={cn(ICON_BTN, "hidden sm:grid")}>
                  <SlidersHorizontal className="size-4" aria-hidden />
                </button>
              </PopoverTrigger>
            </Tip>
            <PopoverContent align="end" className="w-[280px] p-3.5">
              <p className="m-0 text-[13px] font-semibold text-[var(--ds-ink)]">For your next letter</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-[var(--ds-muted)]">Saved as your defaults in Settings.</p>
              <div className="mt-3 text-[12.5px] font-medium text-[var(--ds-muted)]">Law</div>
              <Segmented
                label="Law"
                value={jurisdiction}
                options={[
                  { id: "UK", label: "UK" },
                  { id: "US", label: "US" },
                ]}
                onChange={(v) => patchDefaults({ jurisdiction: v as Jurisdiction })}
              />
              <div className="mt-3 text-[12.5px] font-medium text-[var(--ds-muted)]">Tone</div>
              <Segmented
                label="Tone"
                value={tone}
                options={tones.map((t) => ({ id: t.id, label: t.label }))}
                onChange={(v) =>
                  employer
                    ? patchDefaults({ tone: v as (typeof HR_TONES)[number]["id"] })
                    : patchDefaults({ employeeTone: v as (typeof EMPLOYEE_TONES)[number]["id"] })
                }
                wrap
              />
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={send}
            disabled={!typing}
            aria-label={sendLabel}
            title={typing ? sendLabel : undefined}
            className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-[var(--ds-accent)] text-[var(--ds-on-accent)] transition-colors duration-[120ms] hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-press)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus)] disabled:cursor-default disabled:opacity-[0.28] disabled:hover:bg-[var(--ds-accent)]"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Suggestions sit outside the box: common letters before typing, best matches while typing. */}
      <div className={cn("mt-3 min-w-0 flex-wrap items-center gap-1.5", typing ? "flex" : "hidden md:flex")} aria-live="polite">
        <span className="mr-1 text-[12.5px] text-[var(--ds-muted)]">
          {typing ? (matches.length > 0 ? "Best match" : "No close match.") : "Try"}
        </span>
        {suggestions.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => start(l.id)}
            className={cn(
              "inline-flex h-7 max-w-full items-center truncate rounded-full border px-2.5 text-[12.5px] font-medium transition-colors duration-[120ms] active:bg-[var(--ds-surface-3)]",
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
            className="rounded-[4px] text-[12.5px] font-medium text-[var(--ds-ink)] underline-offset-2 hover:underline"
          >
            Browse all letter types
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "Files": the files DraftHR uses sit with a letter as its evidence, so this
 * asks which letter, then opens that letter's evidence page to add them.
 * With no letter yet it says so and offers to start one.
 */
function FilesButton({ mode, prefix }: { mode: Mode; prefix: string }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const [open, setOpen] = useState(false);
  const letters = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.mode === mode && !d.isTemplateSource && !isSent(d))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
    [drafts, mode]
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={LINK_BTN}>
          <Paperclip className="size-[15px]" aria-hidden />
          Files
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[290px] p-2">
        <p className="m-0 px-2 pt-1 text-[13px] font-semibold text-[var(--ds-ink)]">Add files to a letter</p>
        <p className="m-0 px-2 pt-0.5 pb-2 text-[12.5px] leading-snug text-[var(--ds-muted)]">
          Files are kept with a letter as its evidence. Pick the letter.
        </p>
        {letters.length === 0 ? (
          <div className="px-2 pb-1.5">
            <p className="m-0 text-[13px] text-[var(--ds-muted)]">No letters in progress yet.</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                nav(`${prefix}/new`);
              }}
              className="mt-1.5 inline-flex items-center gap-1 rounded-[4px] text-[13px] font-medium text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
            >
              Start a letter
              <ArrowRight className="size-3" aria-hidden />
            </button>
          </div>
        ) : (
          <ul className="m-0 list-none p-0" aria-label="Letters in progress">
            {letters.map((d) => {
              const who = personFor(d);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      nav(`/editor/${d.id}/evidence`);
                    }}
                    className="flex w-full min-w-0 items-center gap-2.5 rounded-[8px] px-2 py-[7px] text-left transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus)]"
                  >
                    <Paperclip className="size-[14px] shrink-0 text-[var(--ds-muted)]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ds-ink)]">
                      {letterName(d)}
                      {who && <span className="text-[var(--ds-muted)]"> · {who}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
  wrap,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
  wrap?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("mt-1.5 flex gap-0.5 rounded-[10px] bg-[var(--ds-surface-2)] p-[3px]", wrap && "flex-wrap")}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "h-[28px] flex-1 whitespace-nowrap rounded-[8px] px-2.5 text-[13px] transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-[var(--ds-focus)]",
              on
                ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s)]"
                : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
