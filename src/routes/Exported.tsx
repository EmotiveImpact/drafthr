import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, FileDown, FileText } from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { getLetterMeta } from "@/lib/letters/catalog";
import { useProfileStore } from "@/lib/profile";
import type { Draft, ExportEvent } from "@/lib/letters/types";

const RISK_PILL: Record<string, string> = {
  low: "bg-green-50 text-green-800 border-green-200",
  medium: "bg-amber-50 text-amber-900 border-amber-200",
  high: "bg-rose-50 text-rose-900 border-rose-200",
};

/**
 * Exported letters — drafts that have produced at least one PDF or DOCX.
 * Filtered by the active mode in profile.
 */
export function Exported() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  const list = useMemo(() => {
    return Object.values(drafts)
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
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav(-1)}
          className="text-muted-foreground -ml-3 mb-2 h-7"
        >
          <ChevronLeft className="size-3.5 mr-1" /> Back
        </Button>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
          Exported
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Sent letters</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Letters you've finalised and exported as PDF or DOCX. Re-open any draft to issue a
          new export — each one is logged.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-dashed border-letter-rule p-10 text-center">
          <FileDown className="size-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing exported yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            When you export a letter from the editor, it appears here with a record of the
            format, timestamp, and any counsel-review attestation.
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{list.length} exported letter{list.length === 1 ? "" : "s"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-sidebar-border">
              {list.map((item) => (
                <li
                  key={item.draft.id}
                  className="px-6 py-3 hover:bg-muted/30 cursor-pointer"
                  onClick={() => nav(`/editor/${item.draft.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-md bg-muted/40 grid place-items-center shrink-0">
                      <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {item.meta?.shortTitle ?? item.draft.letterType}
                        </span>
                        {item.meta && (
                          <Badge className={RISK_PILL[item.meta.riskClass]}>{item.meta.riskClass}</Badge>
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.draft.mode === "employer" ? "HR" : "employee"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.draft.mode === "employer"
                          ? item.draft.employee.legalName || "(no recipient)"
                          : `to ${item.draft.employer.legalName || "(employer)"}`}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground tabular-nums shrink-0">
                      {item.latest && (
                        <>
                          <div className="font-medium text-foreground">
                            {item.latest.format.toUpperCase()}
                          </div>
                          <div>{formatRel(item.latest.exportedAt)}</div>
                          {item.latest.reviewedBy && (
                            <div className="text-[10px] mt-0.5">
                              ✓ {item.latest.reviewedBy}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {(item.draft.exports?.length ?? 0) > 1 && (
                    <div className="mt-2 ml-12 text-[11px] text-muted-foreground">
                      {item.draft.exports!.length} total exports —{" "}
                      {item.draft.exports!
                        .slice(0, 3)
                        .map((e) => `${e.format.toUpperCase()} ${formatRel(e.exportedAt)}`)
                        .join(" · ")}
                      {item.draft.exports!.length > 3 && " · …"}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function latestExport(d: Draft): ExportEvent | undefined {
  if (!d.exports || d.exports.length === 0) return undefined;
  return [...d.exports].sort((a, b) => b.exportedAt - a.exportedAt)[0];
}

function safeMeta(id: string) {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
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
