import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FileDown } from "lucide-react";
import { PageHeader, EmptyState, Avatar } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { useProfileStore } from "@/lib/profile";
import type { Draft, ExportEvent } from "@/lib/letters/types";
import { PaperIcon, Pill, type PillTone } from "@/components/finalize/Plan";
import { tintForLetter } from "@/components/templates/tints";

const RISK_TONE: Record<string, PillTone> = {
  low: "green",
  medium: "amber",
  high: "red",
};

const FORMAT_LABEL: Record<ExportEvent["format"], string> = {
  pdf: "PDF",
  docx: "Word",
  txt: "Plain text",
  pack: "Evidence pack",
  "marked-sent": "Marked as sent",
};

/**
 * Sent letters (`/exported`): every letter that has been exported or marked
 * as sent, as 13B rows with a paper thumbnail, the formats it went out in
 * and who reviewed it. Each export is logged; opening a row re-opens the
 * letter for a new export.
 */
export function Exported() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  const list = useMemo(() => {
    return Object.values(drafts)
      .filter((d) => !d.isTemplateSource)
      .filter((d) => (role ? d.mode === role : true))
      .filter((d) => (d.exports?.length ?? 0) > 0)
      .map((d) => ({
        draft: d,
        latest: latestExport(d),
        reviewedBy: latestReviewer(d),
        formats: Array.from(new Set((d.exports ?? []).map((e) => e.format))),
        meta: safeMeta(d.letterType),
      }))
      .sort((a, b) => (b.latest?.exportedAt ?? 0) - (a.latest?.exportedAt ?? 0));
  }, [drafts, role]);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        crumbs={[{ label: "Exported" }]}
        title="Sent letters"
        lede="Letters you've finalised and exported as PDF, Word, plain text or an evidence pack. Open any letter to issue a new export; each one is logged."
      />

      {list.length === 0 ? (
        <EmptyState
          icon={FileDown}
          title="Nothing exported yet"
          body="Exported letters land here with a record of format, timestamp, and any counsel-review attestation."
          primary={{ label: "Browse drafts", to: "/" }}
        />
      ) : (
        <div>
          <div
            aria-hidden
            className="hidden min-h-[30px] items-center gap-4 border-b border-[var(--ds-line)] px-3.5 text-[12px] text-[var(--ds-muted)] md:grid md:grid-cols-[44px_minmax(0,1fr)_200px_160px_96px_20px]"
          >
            <span />
            <span>Letter</span>
            <span>Format</span>
            <span>Reviewed by</span>
            <span className="text-right">Exported</span>
            <span />
          </div>
          <ul className="m-0 flex list-none flex-col p-0 pt-1.5">
            {list.map((item) => {
              const title = item.draft.title || item.meta?.shortTitle || item.draft.letterType;
              const to =
                item.draft.mode === "employer"
                  ? item.draft.employee.legalName || "No recipient"
                  : `To ${item.draft.employer.legalName || "your employer"}`;
              const shownFormats = item.formats.filter((f) => f !== "marked-sent");
              const sent = item.formats.includes("marked-sent");
              return (
                <li
                  key={item.draft.id}
                  className="relative [&+&]:before:absolute [&+&]:before:inset-x-3.5 [&+&]:before:top-0 [&+&]:before:border-t [&+&]:before:border-[var(--ds-line)] [&+&]:before:content-['']"
                >
                  <button
                    type="button"
                    onClick={() => nav(`/editor/${item.draft.id}`)}
                    className="relative grid min-h-[66px] w-full grid-cols-[44px_minmax(0,1fr)_20px] items-center gap-3 rounded-[var(--ds-r-m)] px-3.5 py-[11px] text-left transition hover:bg-[var(--ds-surface-2)] md:grid-cols-[44px_minmax(0,1fr)_200px_160px_96px_20px] md:gap-4"
                  >
                    <PaperIcon tint={tintForLetter(item.draft.letterType)} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-semibold text-[var(--ds-ink)]">
                        {title}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-[var(--ds-muted)]">
                        <span className="truncate">{to}</span>
                        {item.meta && (
                          <Pill tone={RISK_TONE[item.meta.riskClass]} className="h-[18px] px-1.5 text-[11px]">
                            {item.meta.riskClass} risk
                          </Pill>
                        )}
                      </span>
                      {/* Phones: format and time fold under the title. */}
                      <span className="mt-1 flex flex-wrap items-center gap-1 md:hidden">
                        {sent && <Pill tone="green" round>Sent</Pill>}
                        {shownFormats.map((f) => (
                          <Pill key={f}>{FORMAT_LABEL[f]}</Pill>
                        ))}
                        <span className="text-[12px] text-[var(--ds-muted)]">
                          {item.latest ? formatRel(item.latest.exportedAt) : ""}
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 flex-wrap items-center gap-1 md:flex">
                      {sent && <Pill tone="green" round>Sent</Pill>}
                      {shownFormats.map((f) => (
                        <Pill key={f}>{FORMAT_LABEL[f]}</Pill>
                      ))}
                    </span>
                    <span className="hidden min-w-0 items-center gap-2 text-[12.5px] md:flex">
                      {item.reviewedBy ? (
                        <>
                          <Avatar name={item.reviewedBy} size="md" />
                          <span className="truncate text-[var(--ds-body)]">{item.reviewedBy}</span>
                        </>
                      ) : (
                        <span className="text-[var(--ds-faint)]">Not reviewed</span>
                      )}
                    </span>
                    <span className="hidden whitespace-nowrap text-right text-[12.5px] text-[var(--ds-muted)] md:block">
                      {item.latest ? formatRel(item.latest.exportedAt) : ""}
                    </span>
                    <ChevronRight className="size-4 text-[var(--ds-faint)]" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function latestExport(d: Draft): ExportEvent | undefined {
  if (!d.exports || d.exports.length === 0) return undefined;
  return [...d.exports].sort((a, b) => b.exportedAt - a.exportedAt)[0];
}

/** Most recent counsel reviewer recorded on any export of this letter. */
function latestReviewer(d: Draft): string | undefined {
  return [...(d.exports ?? [])]
    .sort((a, b) => b.exportedAt - a.exportedAt)
    .find((e) => e.reviewedBy)?.reviewedBy;
}

function safeMeta(id: string) {
  try { return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]); } catch { return null; }
}

function formatRel(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
