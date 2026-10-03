import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@radix-ui/themes";
import { FileDown, FileText } from "lucide-react";
import { PageHeader, DataTable, StatusDot, EmptyState, type StatusTone } from "@/components/ds";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { useProfileStore } from "@/lib/profile";
import type { Draft, ExportEvent } from "@/lib/letters/types";
import { isDatabaseWorkspaceEnabled } from "@/lib/workspace-flags";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listWorkspaceFiles } from "@/lib/storage/workspace-files";
import { workspaceFileUrl, type WorkspaceFile } from "@/lib/storage/workspace-file-types";
import { Button } from "@/components/ui/button";

const RISK_TONE: Record<string, StatusTone> = {
  low: "green",
  medium: "amber",
  high: "red",
};

export function Exported() {
  return isDatabaseWorkspaceEnabled() ? <DatabaseExports /> : <LegacyExports />;
}

function DatabaseExports() {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.id;
  const nav = useNavigate();
  const [state, setState] = useState<{ tenantId?: string; files: WorkspaceFile[]; error?: string; loading: boolean }>({ files: [], loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ tenantId, files: [], loading: true });
    if (tenantId) void listWorkspaceFiles(tenantId).then(files => {
      if (!cancelled) setState({ tenantId, files: files.sort((a, b) => b.completedAt - a.completedAt), loading: false });
    }).catch(error => {
      if (!cancelled) setState({ tenantId, files: [], loading: false, error: error instanceof Error ? error.message : "Could not load exports" });
    });
    return () => { cancelled = true; };
  }, [tenantId, retry]);
  const loading = state.loading || state.tenantId !== tenantId;
  return <Box className="max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
    <PageHeader crumbs={[{ label: "Exported" }]} title="Exported letters"
      lede="Download the exact files saved at export time. Editing a draft does not change an earlier export. Exporting does not send a letter." />
    {loading ? <p role="status">Loading saved exports…</p> : state.error ? <>
      <p role="alert">{state.error}</p>
      <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button>
    </> : <DataTable rows={state.files} rowKey={file => file.id}
      empty={<EmptyState icon={FileDown} title="No saved export files yet"
        body="Create an export from Finalise to save a private, downloadable copy. Older export-history entries do not contain the original files."
        primary={{ label: "Browse drafts", to: "/" }} />}
      columns={[
        { key: "file", header: "File", cell: file => file.filename },
        { key: "recipient", header: "To", hideOn: "sm", cell: file => file.recipient || "—" },
        { key: "revision", header: "Draft version", hideOn: "md", cell: file => String(file.draftRevision) },
        { key: "when", header: "Exported", cell: file => formatRel(file.completedAt) },
        { key: "download", header: "Actions", cell: file => <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild><a href={workspaceFileUrl(file.id, tenantId!)} download={file.filename}>Download</a></Button>
          <Button size="sm" variant="ghost" onClick={() => nav(`/editor/${file.draftId}`)}>Open draft</Button>
        </div> },
      ]} />}
  </Box>;
}

function LegacyExports() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  const list = useMemo(() => {
    return Object.values(drafts)
      .filter((d) => !d.isTemplateSource)
      .filter((d) => (role ? d.mode === role : true))
      .filter((d) => d.exports?.some(event => event.format !== "marked-sent"))
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
        title="Exported letters"
        lede="Export history for your letters. Exporting does not send a letter. Re-open a draft to create a new export; older entries do not retain the original file."
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
  return d.exports.filter(event => event.format !== "marked-sent").sort((a, b) => b.exportedAt - a.exportedAt)[0];
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
