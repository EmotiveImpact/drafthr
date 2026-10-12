import type { ReactNode } from "react";
import { Check, Pilcrow, X } from "lucide-react";
import { Avatar } from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * 5A edit card (Harvey's "made an edit" card): who made the edit and when,
 * a lilac tag naming the change, the changed words, the justification and
 * Reject / Accept. Purely presentational: the caller wires Accept and
 * Reject to the store handlers that already exist.
 *
 * `emphasis` marks the card that is up next (full opacity, filled surface);
 * the others sit quieter until hovered, as in the design.
 */
export function EditCard({
  author,
  human,
  seed,
  time,
  tag,
  section,
  diff,
  justification,
  emphasis,
  canResolve,
  onAccept,
  onReject,
  onJump,
}: {
  author: string;
  /** A person (collaborator) rather than DraftHR: shows their avatar. */
  human?: boolean;
  seed?: string;
  time?: string;
  tag: string;
  section?: string;
  diff?: ReactNode;
  justification?: string;
  emphasis?: boolean;
  canResolve: boolean;
  onAccept: () => void;
  onReject: () => void;
  /** Scroll the letter to the edited section. */
  onJump?: () => void;
}) {
  return (
    <article
      aria-label={`Edit: ${tag}`}
      className={cn(
        "min-w-0 rounded-[var(--ds-r-m)] p-3.5 transition-[opacity,background-color] duration-150",
        emphasis
          ? "bg-[var(--ds-surface-2)]"
          : "opacity-60 hover:opacity-90 focus-within:opacity-90",
      )}
    >
      <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-[var(--ds-muted)]">
        {human ? (
          <Avatar seed={seed} name={author} size="sm" />
        ) : (
          <span
            aria-hidden
            className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-[var(--ds-accent)] text-[10px] font-bold leading-none text-[var(--ds-on-accent)]"
          >
            D
          </span>
        )}
        <span className="min-w-0 truncate">
          <b className="font-medium text-[var(--ds-ink)]">{author}</b>{" "}
          {human ? "suggested an edit" : "made an edit"}
        </span>
        {time && <span className="ds-mono ml-auto shrink-0 text-[12px]">{time}</span>}
      </div>

      <span className="mt-3 inline-block max-w-full truncate rounded-[var(--ds-r-s)] bg-[var(--ds-violet-bg)] px-[7px] py-[2px] align-top text-[12px] font-medium leading-[18px] text-[var(--ds-violet-fg)]">
        {tag}
      </span>

      {(section || diff) && (
        <div className="mt-2.5 border-l-2 border-[var(--ds-line-strong)] py-px pl-2.5 font-serif font-normal tracking-normal text-[13.5px] leading-[1.5] text-[var(--ds-body)] [overflow-wrap:anywhere]">
          {section && (
            <button
              type="button"
              onClick={onJump}
              disabled={!onJump}
              className="mb-0.5 flex items-center gap-1 font-sans text-[11.5px] font-medium text-[var(--ds-muted)] enabled:hover:text-[var(--ds-ink)]"
              title={onJump ? "Show in the letter" : undefined}
            >
              <Pilcrow className="size-3" />
              {section}
            </button>
          )}
          {diff}
        </div>
      )}

      {justification && (
        <p className="m-0 mt-2.5 text-[13px] leading-[1.5] text-[var(--ds-body)]">
          <span className="text-[var(--ds-muted)]">Justification:</span> {justification}
        </p>
      )}

      {canResolve ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onReject}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1 rounded-[var(--ds-r-s)] px-3.5 text-[13px] font-medium text-[var(--ds-ink)] transition-colors",
              emphasis
                ? "bg-[var(--ds-surface)] hover:bg-[var(--ds-surface-3)]"
                : "bg-[var(--ds-surface-2)] hover:bg-[var(--ds-surface-3)]",
            )}
          >
            <X className="size-3.5 opacity-60" aria-hidden />
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1 rounded-[var(--ds-r-s)] px-3.5 text-[13px] font-medium transition-colors",
              emphasis
                ? "bg-[var(--ds-accent)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-accent-hover)]"
                : "bg-[var(--ds-chip)] text-[var(--ds-ink)] hover:bg-[var(--ds-accent)] hover:text-[var(--ds-on-accent)]",
            )}
          >
            <Check className="size-3.5 opacity-70" aria-hidden />
            Accept
          </button>
        </div>
      ) : (
        <p className="m-0 mt-3 text-[12px] text-[var(--ds-muted)]">Awaiting the author</p>
      )}
    </article>
  );
}

/** Inline redline for a card: removed words struck in grey, added words in blue. */
export function EditDiff({ parts }: { parts: { kind: "del" | "ins" | "text"; text: string }[] }) {
  return (
    <p className="m-0">
      {parts.map((p, i) =>
        p.kind === "del" ? (
          <del key={i} className="mr-1 text-[var(--ds-faint)] decoration-[var(--ds-faint)]">
            {p.text}
          </del>
        ) : p.kind === "ins" ? (
          <ins key={i} className="mr-1 text-[var(--ds-blue-fg)] no-underline">
            {p.text}
          </ins>
        ) : (
          <span key={i} className="mr-1">
            {p.text}
          </span>
        ),
      )}
    </p>
  );
}
