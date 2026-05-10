import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import {
  ChevronLeft,
  FilePlus2,
  FileEdit,
  RotateCw,
  ShieldCheck,
  FileDown,
  Activity as ActivityIcon,
} from "lucide-react";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { Draft } from "@/lib/letters/types";

type Event = {
  ts: number;
  draftId: string;
  draftLabel: string;
  mode: "employer" | "employee";
  kind: "created" | "regenerated" | "exported" | "counsel_review" | "updated";
  description: string;
  meta?: string;
};

/**
 * Activity feed — synthesised from existing draft data:
 *   - draft.createdAt              → "Created [letter]"
 *   - section.versions[]           → "Regenerated [section] (vN)"
 *   - draft.exports[]              → "Exported as PDF/DOCX"
 *   - answers._counselReview       → "Counsel review attested by X"
 *   - draft.updatedAt              → fallback "Last updated"
 *
 * No backend / no separate audit table — derived live from the store. When
 * Postgres is wired, the same shape can come from a server-side audit_log.
 */
export function Activity() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const role = useProfileStore((s) => s.profile.role);

  const events = useMemo(() => {
    const out: Event[] = [];
    const list = Object.values(drafts).filter((d) => (role ? d.mode === role : true));
    for (const d of list) {
      const label = safeMeta(d.letterType)?.shortTitle ?? d.letterType.replace(/_/g, " ");

      out.push({
        ts: d.createdAt,
        draftId: d.id,
        draftLabel: label,
        mode: d.mode,
        kind: "created",
        description: `Created ${label}`,
        meta: d.context.jurisdiction,
      });

      // Regenerations: every section.versions[] beyond the first is a regen.
      for (const sec of d.sections) {
        sec.versions.forEach((v, i) => {
          if (i === 0) return; // initial generation already implied by created
          out.push({
            ts: v.createdAt,
            draftId: d.id,
            draftLabel: label,
            mode: d.mode,
            kind: "regenerated",
            description: `Regenerated "${sec.title}"`,
            meta: `v${i + 1}`,
          });
        });
      }

      // Counsel review attestation
      const review = (d.answers as Record<string, unknown>)._counselReview as
        | { reviewedBy?: string; reviewedOn?: string }
        | undefined;
      if (review?.reviewedBy && review.reviewedOn) {
        out.push({
          ts: new Date(review.reviewedOn).getTime() || d.updatedAt,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
          kind: "counsel_review",
          description: `Counsel review attested by ${review.reviewedBy}`,
          meta: review.reviewedOn,
        });
      }

      // Exports
      for (const ex of d.exports ?? []) {
        out.push({
          ts: ex.exportedAt,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
          kind: "exported",
          description: `Exported as ${ex.format.toUpperCase()}`,
          meta: ex.reviewedBy ? `attested by ${ex.reviewedBy}` : undefined,
        });
      }

      // Last update — only if substantively newer than created.
      if (d.updatedAt - d.createdAt > 60_000 && !out.some((e) => e.draftId === d.id && e.ts === d.updatedAt)) {
        out.push({
          ts: d.updatedAt,
          draftId: d.id,
          draftLabel: label,
          mode: d.mode,
          kind: "updated",
          description: `Last updated ${label}`,
        });
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }, [drafts, role]);

  // Group by day
  const groups = useMemo(() => {
    const out: { day: string; events: Event[] }[] = [];
    for (const e of events) {
      const day = formatDay(e.ts);
      const existing = out.find((g) => g.day === day);
      if (existing) existing.events.push(e);
      else out.push({ day, events: [e] });
    }
    return out;
  }, [events]);

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
          Activity
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Audit trail</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Every draft you've created, regenerated, exported, and attested.
          Useful for a paper trail when sharing context with a lawyer or HR partner.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-letter-rule p-10 text-center">
          <ActivityIcon className="size-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">No activity yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Start drafting a letter and the audit trail builds itself.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <Card key={g.day}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{g.day}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-sidebar-border">
                  {g.events.map((e, i) => (
                    <li
                      key={i}
                      onClick={() => nav(`/editor/${e.draftId}`)}
                      className="px-6 py-2.5 grid grid-cols-[18px_1fr_auto] gap-3 items-start hover:bg-muted/30 cursor-pointer"
                    >
                      <span className="mt-0.5">{iconFor(e.kind)}</span>
                      <div className="min-w-0">
                        <div className="text-sm">
                          {e.description}{" "}
                          <span className="text-muted-foreground">· {e.draftLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                          <Badge className="bg-muted text-foreground border-letter-rule px-1.5 py-0 text-[9px]">
                            {e.mode === "employer" ? "HR" : "employee"}
                          </Badge>
                          {e.meta && <span>· {e.meta}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {formatTime(e.ts)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function iconFor(kind: Event["kind"]) {
  const cls = "size-4 text-muted-foreground";
  switch (kind) {
    case "created":
      return <FilePlus2 className={cls} />;
    case "regenerated":
      return <RotateCw className={cls} />;
    case "exported":
      return <FileDown className={cls} />;
    case "counsel_review":
      return <ShieldCheck className={cls + " text-green-700"} />;
    case "updated":
      return <FileEdit className={cls} />;
    default:
      return <ActivityIcon className={cls} />;
  }
}

function safeMeta(id: string): { shortTitle: string } | null {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
}

function formatDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
// Avoid unused-import error for Draft type only used in the underlying store.
export type { Draft as _Draft };
