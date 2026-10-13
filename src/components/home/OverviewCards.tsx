/**
 * The Overview tab's cards (mock home): letters to continue, the "Needs
 * you" rail card, and the private History card.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, FileText, Lock, MessageSquare } from "lucide-react";
import type { Matter } from "@/lib/letters/types";
import { Pill } from "@/components/ds";
import { cn } from "@/lib/utils";
import { ART_CARD, ArtCardBody, categoryName, tintFor } from "./letterArt";
import { letterName, personFor, shortAgo, type HistoryRow, type LetterJourney, type NeedItem } from "./homeData";
import { RailBox } from "./HomeParts";

/* ─── Continue where you left off ──────────────────────────────────── */

export function ContinueCards({
  letters,
  matters,
  startHref,
}: {
  letters: LetterJourney[];
  matters: Record<string, Matter>;
  startHref: string;
}) {
  if (letters.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-[16px] border border-dashed border-[var(--ds-line-strong)] px-5 py-6">
        <p className="m-0 text-[14.5px] font-medium text-[var(--ds-ink)]">No letters yet</p>
        <p className="m-0 text-[13px] text-[var(--ds-muted)]">Letters you start appear here so you can pick them up again.</p>
        <Link
          to={startHref}
          className="mt-1 inline-flex items-center gap-1 rounded-[4px] text-[13.5px] font-medium text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
        >
          Start a letter
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    );
  }
  return (
    <div className="@container w-full min-w-0">
      <div className="grid grid-cols-1 gap-3.5 @[460px]:grid-cols-2 @[680px]:grid-cols-3">
        {letters.map(({ draft: d, journey: j }) => {
          const who = personFor(d);
          const matter = d.matterId ? matters[d.matterId]?.name : undefined;
          // A matter named after the person ("Jordan Hale, attendance") would
          // repeat the name, so the letter's category reads better there.
          const second = matter && !(who && matter.toLowerCase().includes(who.toLowerCase())) ? matter : categoryName(d.letterType);
          const meta = [who, second].filter(Boolean).join(" · ");
          return (
            <Link key={d.id} to={`/editor/${d.id}`} className={ART_CARD}>
              <ArtCardBody
                tint={tintFor(d.letterType)}
                title={letterName(d)}
                meta={meta}
                pill={<Pill tone={j.statusTone}>{j.statusLabel}</Pill>}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Needs you ────────────────────────────────────────────────────── */

export function NeedRow({ item, phone = false }: { item: NeedItem; phone?: boolean }) {
  return (
    <li className="border-t border-[var(--ds-line-2)] first:border-t-0">
      <Link
        to={item.href}
        className={cn(
          "-mx-2 flex items-start gap-3 rounded-[10px] px-2 py-3 transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus)]",
          phone && "py-[13px]"
        )}
      >
        <Pill tone={item.pill.tone} className={cn("mt-px shrink-0", phone && "w-[76px]")}>
          {item.pill.label}
        </Pill>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[14px] leading-snug text-[var(--ds-ink)]", phone && "text-[14.5px]")}>{item.title}</span>
          <span className="mt-[3px] block text-[12.5px] leading-snug text-[var(--ds-muted)]">{item.meta}</span>
        </span>
        {phone && <ChevronRight className="mt-0.5 size-4 shrink-0 text-[var(--ds-faint)]" aria-hidden />}
      </Link>
    </li>
  );
}

export function NeedsYouCard({ items, startHref }: { items: NeedItem[]; startHref: string }) {
  return (
    <RailBox title="Needs you" action={items.length > 0 ? { label: "View all", to: "/hr?view=needs-you" } : undefined}>
      {items.length === 0 ? (
        <div className="pb-4">
          <p className="m-0 text-[13.5px] text-[var(--ds-muted)]">Nothing needs you right now.</p>
          <Link
            to={startHref}
            className="mt-2 inline-flex items-center gap-1 rounded-[4px] text-[13px] font-medium text-[var(--ds-ink)] underline-offset-[3px] hover:underline"
          >
            Start your first letter
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      ) : (
        <ul className="m-0 list-none p-0 pb-1">
          {items.slice(0, 5).map((it) => (
            <NeedRow key={it.id} item={it} />
          ))}
        </ul>
      )}
    </RailBox>
  );
}

/* ─── History ──────────────────────────────────────────────────────── */

export function HistoryCard({ rows }: { rows: HistoryRow[] }) {
  return (
    <RailBox
      title="History"
      badge={
        <span className="ml-2 inline-flex items-center gap-[5px] rounded-[6px] bg-[var(--ds-surface-2)] px-2 py-0.5 text-[12px] text-[var(--ds-muted)]">
          <Lock className="size-[11px]" aria-hidden />
          Private to you
        </span>
      }
      action={{ label: "View all", to: "/activity" }}
    >
      {rows.length === 0 ? (
        <p className="m-0 pb-4 text-[13.5px] leading-snug text-[var(--ds-muted)]">
          Activity will appear here as you draft, edit and export letters.
        </p>
      ) : (
        <ul className="m-0 list-none p-0 pb-1">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={`/editor/${r.draftId}`}
                className="-mx-2 flex items-start gap-3 rounded-[10px] px-2 py-2.5 transition-colors duration-[120ms] hover:bg-[var(--ds-hover)] active:bg-[var(--ds-surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ds-focus)]"
              >
                <MessageSquare className="mt-0.5 size-[15px] shrink-0 text-[var(--ds-subtle)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-[1.35] text-[var(--ds-ink)]">{r.title}</span>
                  <span className="mt-1 flex items-center gap-1 text-[12.5px] text-[var(--ds-subtle)]">
                    {r.pill ? <Pill tone={r.pill.tone}>{r.pill.label}</Pill> : <span>Completed</span>}
                    <span aria-hidden>·</span>
                    <span>{shortAgo(r.ts)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailBox>
  );
}

/* ─── Every item that needs you (Needs you, View all) ─────────────── */

export function NeedsYouList({ items }: { items: NeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[16px] border border-[var(--ds-line)] px-6 py-10 text-center">
        <FileText className="mx-auto size-5 text-[var(--ds-subtle)]" aria-hidden />
        <p className="m-0 mt-2 text-[14.5px] font-medium text-[var(--ds-ink)]">Nothing needs you right now.</p>
        <p className="m-0 mt-1 text-[13px] text-[var(--ds-muted)]">Letters to approve, hearings this week and tasks due appear here.</p>
      </div>
    );
  }
  return (
    <ul className="m-0 max-w-[760px] list-none rounded-[16px] border border-[var(--ds-line)] px-5 py-1">
      {items.map((it) => (
        <NeedRow key={it.id} item={it} />
      ))}
    </ul>
  );
}
