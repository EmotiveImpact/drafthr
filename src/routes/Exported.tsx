import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@radix-ui/themes";
import { FileDown, FileText } from "lucide-react";
import { PageHeader, DataTable, StatusDot, EmptyState, type StatusTone } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { useProfileStore } from "@/lib/profile";
import type { Draft, ExportEvent } from "@/lib/letters/types";

const RISK_TONE: Record<string, StatusTone> = {
  low: "green",
  medium: "amber",
  high: "red",
};

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
        meta: safeMeta(d.letterType),
      }))
      .sort((a, b) => (b.latest?.exportedAt ?? 0) - (a.latest?.exportedAt ?? 0));
  }, [drafts, role]);

  return (
    <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        crumbs={[{ label: "Exported" }]}
        title="Sent letters"
        lede="Letters you've finalised and exported as PDF, DOCX, or an evidence pack. Re-open any draft to issue a new export — each one is logged."
      />

      <DataTable
        rows={list}
        rowKey={(item) => item.draft.id}
        onRowClick={(item) => nav(`/editor/${item.draft.id}`)}
        empty={
          <EmptyState
            icon={FileDown}
            title="Nothing exported yet"
            body="Exported letters land here with a record of format, timestamp, and any counsel-review attestation."
            primary={{ label: "Browse drafts", to: "/" }}
          />
        }
        columns={[
          {
            key: "letter",
            header: "Letter",
            cell: (item) => (
              <span className="inline-flex items-center gap-3 min-w-0">
                <FileText className="size-4 shrink-0 text-[var(--ds-muted)]" />
                <span className="font-medium text-[var(--ds-ink)] truncate">
                  {item.meta?.shortTitle ?? item.draft.letterType}
                </span>
              </span>
            ),
          },
          {
            key: "to",
            header: "To",
            hideOn: "sm",
            cell: (item) => (
              <span className="text-[var(--ds-muted)] truncate">
                {item.draft.mode === "employer"
                  ? item.draft.employee.legalName || "(no recipient)"
                  : `to ${item.draft.employer.legalName || "(employer)"}`}
              </span>
            ),
          },
          {
            key: "risk",
            header: "Risk",
            hideOn: "md",
            cell: (item) =>
              item.meta ? <StatusDot tone={RISK_TONE[item.meta.riskClass]} size="sm">{item.meta.riskClass}</StatusDot> : null,
          },
          {
            key: "format",
            header: "Format",
            hideOn: "sm",
            cell: (item) => (
              <span className="text-[var(--ds-body)] font-medium">
                {item.latest?.format.toUpperCase()}
              </span>
            ),
          },
          {
            key: "review",
            header: "Reviewed",
            hideOn: "lg",
            cell: (item) =>
              item.latest?.reviewedBy ? (
                <StatusDot tone="green" size="sm">{item.latest.reviewedBy}</StatusDot>
              ) : (
                <span className="text-[var(--ds-subtle)]">—</span>
              ),
          },
          {
            key: "when",
            header: "Exported",
            num: true,
            cell: (item) => (
              <span className="text-[var(--ds-muted)] text-[12px]">
                {item.latest ? formatRel(item.latest.exportedAt) : "—"}
              </span>
            ),
          },
        ]}
      />
    </Box>
  );
}

function latestExport(d: Draft): ExportEvent | undefined {
  if (!d.exports || d.exports.length === 0) return undefined;
  return [...d.exports].sort((a, b) => b.exportedAt - a.exportedAt)[0];
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
