import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import {
  PlusCircle,
  Search,
  FileText,
  CircleCheckBig,
  CalendarClock,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  Trash2,
  ScrollText,
  Mail,
  ShieldAlert,
  Scale,
  FileWarning,
  FileSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LetterTypeId, Mode } from "@/lib/letters/types";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { letterCatalogByMode, getLetterMeta } from "@/lib/letters/catalog";

const RISK_PILL: Record<string, string> = {
  low: "bg-green-50 text-green-800 border-green-200",
  medium: "bg-amber-50 text-amber-900 border-amber-200",
  high: "bg-rose-50 text-rose-900 border-rose-200",
};

const STATUS_PILL: Record<string, string> = {
  drafting: "bg-amber-50 text-amber-900 border-amber-200",
  ready: "bg-green-50 text-green-800 border-green-200",
  exported: "bg-muted text-foreground border-letter-rule",
  empty: "bg-muted text-muted-foreground border-letter-rule",
};

/**
 * Mode-aware dashboard. Variant C from the mockups page:
 *   - Hero greeting
 *   - Stats row (4 cards)
 *   - Drafts in progress table
 *   - Upcoming deadlines panel (employee mode only — calculated from
 *     draft.context.protectedDeadline)
 *   - Quick start (4 flagship letter cards)
 */
export function Home({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const profile = useProfileStore((s) => s.profile);

  const myDrafts = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.mode === mode)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, mode]
  );

  const stats = useMemo(() => deriveStats(myDrafts), [myDrafts]);
  const deadlines = useMemo(() => deriveDeadlines(myDrafts), [myDrafts]);

  const catalog = letterCatalogByMode(mode);
  const flagship = catalog.filter((l) => l.flagshipV1);
  const prefix = mode === "employer" ? "/hr" : "/me";
  const greeting = profile.personal.preferredName
    ? `Hello, ${profile.personal.preferredName}.`
    : "Welcome back.";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
            {mode === "employer" ? "HR / Management · Home" : "Employee · Home"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="text-sm text-muted-foreground">
            {myDrafts.length === 0
              ? "Pick a letter type below to get started."
              : `${myDrafts.length} draft${myDrafts.length === 1 ? "" : "s"} · last updated ${timeAgo(myDrafts[0].updatedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            <Search className="size-3.5 mr-1.5" />
            Search
            <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-70">soon</span>
          </Button>
          <Button size="sm" onClick={() => nav(`${prefix}/new`)}>
            <PlusCircle className="size-3.5 mr-1.5" />
            New letter
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total drafts"
          value={String(stats.total)}
          hint={stats.inProgress > 0 ? `${stats.inProgress} in progress` : "—"}
          Icon={FileText}
        />
        <StatCard
          label="Ready to export"
          value={String(stats.ready)}
          hint={stats.ready > 0 ? "reviewed" : "draft to ready"}
          Icon={CircleCheckBig}
        />
        <StatCard
          label="Urgent deadlines"
          value={String(stats.urgent)}
          hint={stats.urgent > 0 ? "< 14 days away" : "none"}
          Icon={AlertTriangle}
          tone={stats.urgent > 0 ? "warn" : undefined}
        />
        <StatCard
          label={`Letters this ${monthLabel()}`}
          value={String(stats.thisMonth)}
          hint={stats.lastMonth > 0 ? `${signed(stats.thisMonth - stats.lastMonth)} vs last month` : "—"}
          Icon={TrendingUp}
        />
      </div>

      {/* Drafts table + deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Drafts in progress</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => nav(`${prefix}/new`)}>
                <PlusCircle className="size-3 mr-1" /> New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {myDrafts.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <FileText className="size-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">No drafts yet.</p>
                <p className="text-xs text-muted-foreground">
                  {profile.setupComplete
                    ? "Pick a letter from Quick start below."
                    : "Set up your profile so drafts auto-fill."}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2">
                  {!profile.setupComplete && (
                    <Button size="sm" variant="outline" onClick={() => nav("/settings")}>
                      Set up profile
                    </Button>
                  )}
                  <Button size="sm" onClick={() => nav(`${prefix}/new`)}>
                    Browse letter types
                  </Button>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/30">
                  <tr>
                    <th className="text-left py-2 px-4 font-normal">Letter</th>
                    <th className="text-left py-2 px-4 font-normal hidden sm:table-cell">
                      {mode === "employer" ? "Recipient" : "To"}
                    </th>
                    <th className="text-left py-2 px-4 font-normal">Status</th>
                    <th className="text-left py-2 px-4 font-normal hidden md:table-cell">Risk</th>
                    <th className="text-right py-2 px-4 font-normal">Updated</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sidebar-border">
                  {myDrafts.slice(0, 8).map((d) => {
                    const meta = safeMeta(d.letterType);
                    const status = draftStatus(d);
                    return (
                      <tr
                        key={d.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => nav(`/editor/${d.id}`)}
                      >
                        <td className="py-2.5 px-4 font-medium truncate max-w-[20ch]">
                          {meta?.shortTitle ?? d.letterType}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground truncate max-w-[18ch] hidden sm:table-cell">
                          {mode === "employer"
                            ? d.employee.legalName || "(no recipient)"
                            : d.employer.legalName || "(no employer)"}
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge className={STATUS_PILL[status]}>{status}</Badge>
                        </td>
                        <td className="py-2.5 px-4 hidden md:table-cell">
                          {meta && <Badge className={RISK_PILL[meta.riskClass]}>{meta.riskClass}</Badge>}
                        </td>
                        <td className="py-2.5 px-4 text-right text-xs text-muted-foreground tabular-nums">
                          {timeAgo(d.updatedAt)}
                        </td>
                        <td className="py-1 pr-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Delete this draft?")) deleteDraft(d.id);
                            }}
                            aria-label="Delete draft"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Deadlines (employee only) */}
        {mode === "employee" ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="size-4 text-amber-700" />
                Upcoming deadlines
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Tribunal / EEOC limitation periods from your "date of act".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {deadlines.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tribunal-bound drafts. Deadlines appear here when you start a high-risk letter.
                </p>
              ) : (
                deadlines.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => nav(`/editor/${d.id}`)}
                    className={`w-full text-left rounded-md border p-2 text-xs ${
                      d.daysAway < 0
                        ? "border-rose-300 bg-rose-50"
                        : d.daysAway < 14
                        ? "border-rose-200 bg-rose-50"
                        : d.daysAway < 30
                        ? "border-amber-200 bg-amber-50"
                        : "border-letter-rule"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium">{d.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {d.daysAway < 0 ? "passed" : `${d.daysAway}d`}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Deadline {formatDate(d.iso)}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Compliance reminders
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                High-risk letter types require counsel review before export.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">UK:</strong> ACAS Code — non-compliance can
                uplift tribunal awards by up to 25% (s.207A TULRCA).
              </p>
              <p>
                <strong className="text-foreground">US:</strong> WARN 60-day notice (100+
                employers, 50+ affected); OWBPA 21 / 7 days for releases by employees 40+.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick start */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Quick start</h3>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => nav(`${prefix}/new`)}>
            Browse all
            <ArrowUpRight className="size-3 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {flagship.slice(0, 8).map((l) => {
            const Icon = iconForLetter(l.id);
            return (
              <Card
                key={l.id}
                className="cursor-pointer hover:border-foreground/30 transition-colors"
                onClick={() => nav(`${prefix}/new/${l.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <Badge className={RISK_PILL[l.riskClass]}>{l.riskClass}</Badge>
                  </div>
                  <p className="text-sm font-medium leading-tight mb-0.5">{l.shortTitle}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {l.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* --- helpers --- */

function StatCard({
  label,
  value,
  hint,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  Icon: typeof FileText;
  tone?: "warn";
}) {
  return (
    <Card className={tone === "warn" ? "border-amber-200 bg-amber-50/40" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
      </CardContent>
    </Card>
  );
}

function safeMeta(id: string) {
  try {
    return getLetterMeta(id as Parameters<typeof getLetterMeta>[0]);
  } catch {
    return null;
  }
}

function deriveStats(drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][]) {
  let inProgress = 0,
    ready = 0,
    urgent = 0,
    thisMonth = 0,
    lastMonth = 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  for (const d of drafts) {
    const status = draftStatus(d);
    if (status === "drafting" || status === "empty") inProgress += 1;
    if (status === "ready") ready += 1;

    const dl = d.context.protectedDeadline;
    if (dl) {
      const days = Math.floor((new Date(dl.iso).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days < 14) urgent += 1;
    }

    if (d.createdAt >= monthStart) thisMonth += 1;
    else if (d.createdAt >= lastMonthStart) lastMonth += 1;
  }
  return { total: drafts.length, inProgress, ready, urgent, thisMonth, lastMonth };
}

function deriveDeadlines(drafts: ReturnType<typeof useDraftStore.getState>["drafts"][string][]) {
  return drafts
    .filter((d) => d.context.protectedDeadline)
    .map((d) => {
      const iso = d.context.protectedDeadline!.iso;
      const daysAway = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
      return {
        id: d.id,
        label: safeMeta(d.letterType)?.shortTitle ?? d.letterType,
        iso,
        daysAway,
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 5);
}

function draftStatus(d: { sections: { status: string; html: string }[] }): "empty" | "drafting" | "ready" | "exported" {
  const all = d.sections;
  if (all.length === 0) return "empty";
  if (all.every((s) => s.status === "empty" && !s.html)) return "empty";
  if (all.every((s) => s.status === "ready")) return "ready";
  if (all.some((s) => s.status === "ready" || s.status === "edited" || s.html)) return "drafting";
  return "empty";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function monthLabel(): string {
  return new Date().toLocaleDateString(undefined, { month: "long" });
}

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function iconForLetter(id: LetterTypeId) {
  switch (id) {
    case "offer":
    case "promotion":
    case "salary_increase":
      return Sparkles;
    case "termination":
    case "warning":
      return ShieldAlert;
    case "reference":
    case "probation_outcome":
    case "resignation_clean":
    case "resignation_with_grievance":
    case "resignation_constructive":
      return Mail;
    case "grievance":
      return FileWarning;
    case "appeal":
      return Scale;
    case "subject_access_request":
      return FileSearch;
    case "whistleblowing":
      return ShieldAlert;
    case "flexible_working_request":
      return CalendarClock;
    case "accommodation_request":
      return ShieldCheck;
    default:
      return ScrollText;
  }
}
