/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  UserRound,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  PlusCircle,
  History,
  FileText,
  ArrowUpRight,
  ChevronsUpDown,
  ChevronRight,
  CalendarClock,
  AlertTriangle,
  Mail,
  Scale,
  FileSearch,
  FileWarning,
  Sun,
  Search,
  CircleCheckBig,
  Settings as SettingsIcon,
  Inbox,
  TrendingUp,
} from "lucide-react";

/**
 * Three concrete layout variants. Pick one (or mix) and we'll apply it across
 * the real app. Each variant is rendered at full size inside this page so it
 * can be evaluated like a real screen — not a wireframe.
 */

const MOCK_DRAFTS = [
  {
    id: "d1",
    type: "Formal Grievance",
    risk: "high" as const,
    recipient: "to Acme Holdings Limited",
    days: 2,
    status: "drafting" as const,
  },
  {
    id: "d2",
    type: "Subject Access Request",
    risk: "low" as const,
    recipient: "to Acme Holdings Limited",
    days: 3,
    status: "ready" as const,
  },
  {
    id: "d3",
    type: "Appeal Letter",
    risk: "high" as const,
    recipient: "to Acme Holdings Limited",
    days: 7,
    status: "exported" as const,
  },
  {
    id: "d4",
    type: "Flexible Working",
    risk: "low" as const,
    recipient: "to Acme Holdings Limited",
    days: 12,
    status: "drafting" as const,
  },
];

const FLAGSHIP_LETTERS = [
  { id: "grievance", name: "Formal Grievance", risk: "high" as const, icon: FileWarning, hint: "ACAS Code Step 1 / Title VII complaint" },
  { id: "resignation_clean", name: "Resignation", risk: "low" as const, icon: Mail, hint: "Standard, gracious. Last day + thanks." },
  { id: "resignation_constructive", name: "Constructive resignation", risk: "high" as const, icon: Mail, hint: "Resigning in response to fundamental breach." },
  { id: "flexible_working_request", name: "Flexible working", risk: "low" as const, icon: CalendarClock, hint: "Day-one statutory right (UK, Apr 2024)." },
  { id: "subject_access_request", name: "Subject Access Request", risk: "low" as const, icon: FileSearch, hint: "UK GDPR Art. 15, 1-month response." },
  { id: "appeal", name: "Appeal letter", risk: "high" as const, icon: Scale, hint: "Four canonical grounds." },
  { id: "whistleblowing", name: "Whistleblowing", risk: "high" as const, icon: ShieldAlert, hint: "PIDA / s.43A ERA 1996." },
  { id: "accommodation_request", name: "Accommodation request", risk: "medium" as const, icon: ShieldCheck, hint: "Equality Act / ADA interactive process." },
];

const RISK_PILL: Record<string, string> = {
  low: "bg-green-50 text-green-800 border-green-200",
  medium: "bg-amber-50 text-amber-900 border-amber-200",
  high: "bg-rose-50 text-rose-900 border-rose-200",
};

const STATUS_PILL: Record<string, string> = {
  drafting: "bg-amber-50 text-amber-900 border-amber-200",
  ready: "bg-green-50 text-green-800 border-green-200",
  exported: "bg-muted text-foreground border-letter-rule",
};

export function Mockups() {
  const [tab, setTab] = useState("a");

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Layout exploration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Pick a direction.</h1>
        <p className="text-sm text-muted-foreground">
          Three concrete layouts rendered at full size with sample data. Tab through them, then
          tell me which one to apply across the app, or which bits to mix.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="a">A · Documents</TabsTrigger>
          <TabsTrigger value="b">B · Workspace</TabsTrigger>
          <TabsTrigger value="c">C · Console</TabsTrigger>
        </TabsList>

        <TabsContent value="a">
          <UxNote
            title="A · Documents: clean and content-first"
            tradeoff="Best when the user comes here knowing what letter they want. Sidebar holds discovery + history; main column is mostly your draft surface. Closest to current direction."
          />
          <VariantA />
        </TabsContent>

        <TabsContent value="b">
          <UxNote
            title="B · Workspace: sidebar-07 carries the chrome"
            tradeoff="Sidebar is wider and more capable (role switcher, recent drafts with actions, user card). Topbar disappears entirely on most screens. Feels like Linear / Notion."
          />
          <VariantB />
        </TabsContent>

        <TabsContent value="c">
          <UxNote
            title="C · Console: information-dense dashboard"
            tradeoff="Slim icon rail + dashboard with stats, deadlines, drafts-in-progress. Right for power users handling many letters. Slightly heavier visual weight; not ideal for a first-time user."
          />
          <VariantC />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UxNote({ title, tradeoff }: { title: string; tradeoff: string }) {
  return (
    <div className="mb-4 rounded-md border border-dashed border-letter-rule bg-muted/30 p-3 text-xs">
      <p className="font-medium mb-0.5">{title}</p>
      <p className="text-muted-foreground leading-relaxed">{tradeoff}</p>
    </div>
  );
}

/* ============================================================================
 *  VARIANT A — Documents
 * ==========================================================================*/

function VariantA() {
  return (
    <div className="rounded-lg border border-sidebar-border bg-background overflow-hidden shadow-sm">
      {/* Topbar */}
      <div className="h-12 border-b border-sidebar-border flex items-center px-3 gap-2 text-sm">
        <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <ScrollText className="size-3.5" />
        </div>
        <span className="font-semibold tracking-tight">DRAFTHR</span>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <span className="text-muted-foreground">Employee · Home</span>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Counsel review recommended
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr] min-h-[640px]">
        {/* Sidebar */}
        <aside className="border-r border-sidebar-border p-3 space-y-4 text-sm">
          <div className="rounded-md bg-sidebar-accent/40 px-2 py-2 flex items-center gap-2">
            <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <UserRound className="size-3.5" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-xs font-medium truncate">Jane Patel</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Employee</div>
            </div>
            <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
          </div>

          <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-sidebar-accent">
            <PlusCircle className="size-4" />
            <span>New letter</span>
          </button>

          <div>
            <p className="px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Flagship letters
            </p>
            <ul className="space-y-0.5">
              {FLAGSHIP_LETTERS.slice(0, 6).map((l) => (
                <li key={l.id}>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-sidebar-accent">
                    <l.icon className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{l.name}</span>
                    {l.risk === "high" && (
                      <Badge className="ml-auto bg-rose-50 text-rose-700 border-rose-200">
                        high
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Recent drafts
            </p>
            <ul className="space-y-0.5">
              {MOCK_DRAFTS.slice(0, 3).map((d) => (
                <li key={d.id}>
                  <button className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-sidebar-accent">
                    <History className="size-3.5 text-muted-foreground" />
                    <span className="truncate text-xs">{d.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Content */}
        <div data-page-main className="p-8 bg-muted/20">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Employee
          </p>
          <h2 className="text-3xl font-semibold tracking-tight mb-2">
            Write the letter you need to send.
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl mb-6">
            Pick a letter type, answer a few questions, and the platform drafts each section.
          </p>

          <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-dashed border-letter-rule px-4 py-3 text-sm bg-background">
            <FileText className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">No drafts yet.</p>
              <p className="text-xs text-muted-foreground">
                Start with a flagship letter. Your details auto-fill.
              </p>
            </div>
            <Button size="sm">
              <PlusCircle className="size-3.5 mr-1.5" /> Start a formal grievance
            </Button>
          </div>

          <h3 className="text-sm font-medium mb-3">Flagship letter types</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FLAGSHIP_LETTERS.slice(0, 6).map((l) => (
              <Card key={l.id} className="cursor-pointer hover:border-foreground/30 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between mb-2">
                    <l.icon className="size-4 text-muted-foreground" />
                    <Badge className={RISK_PILL[l.risk]}>{l.risk}</Badge>
                  </div>
                  <CardTitle className="text-sm leading-tight">{l.name}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{l.hint}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 *  VARIANT B — Workspace (sidebar-07 inspired)
 * ==========================================================================*/

function VariantB() {
  return (
    <div className="rounded-lg border border-sidebar-border bg-background overflow-hidden shadow-sm">
      <div className="grid grid-cols-[280px_1fr] min-h-[680px]">
        {/* Sidebar — does most of the work */}
        <aside className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col text-sm">
          {/* Role switcher */}
          <div className="p-2 border-b border-sidebar-border">
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent">
              <div className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
                <UserRound className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight min-w-0">
                <span className="text-sm font-semibold truncate">Jane Patel</span>
                <span className="text-xs text-muted-foreground truncate">
                  Employee
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </button>
          </div>

          <div className="p-2 flex-1 overflow-auto">
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent text-sm">
              <PlusCircle className="size-4" />
              New letter
            </button>

            <p className="mt-4 px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Letters
            </p>
            <ul className="space-y-0.5">
              {FLAGSHIP_LETTERS.map((l) => (
                <li key={l.id}>
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent">
                    <l.icon className="size-4 text-muted-foreground" />
                    <span className="truncate">{l.name}</span>
                    {l.risk === "high" && (
                      <Badge className="ml-auto bg-rose-50 text-rose-700 border-rose-200">
                        high
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-4 px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Recent drafts
            </p>
            <ul className="space-y-0.5">
              {MOCK_DRAFTS.map((d) => (
                <li key={d.id} className="group/item relative">
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent">
                    <History className="size-4 text-muted-foreground" />
                    <span className="truncate">{d.type}</span>
                  </button>
                  <button className="absolute right-1 top-1/2 -translate-y-1/2 size-6 rounded-sm grid place-items-center opacity-0 group-hover/item:opacity-100 hover:bg-accent">
                    <ChevronRight className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* User card */}
          <div className="p-2 border-t border-sidebar-border">
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent">
              <div className="size-8 rounded-md bg-foreground/10 grid place-items-center text-xs font-semibold">
                JP
              </div>
              <div className="grid flex-1 text-left leading-tight min-w-0">
                <span className="text-sm font-medium truncate">Jane Patel</span>
                <span className="text-xs text-muted-foreground truncate">jane@example.com</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </button>
          </div>
        </aside>

        {/* Content */}
        <div data-page-main className="p-8 bg-muted/20 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Employee · Home
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                Hello Jane.
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Search className="size-3.5 mr-1.5" /> Search letters
              </Button>
              <Button size="sm">
                <PlusCircle className="size-3.5 mr-1.5" /> New letter
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <StatCard label="Drafts in progress" value="2" hint="oldest 12 days" Icon={FileText} />
            <StatCard label="Ready to export" value="1" hint="Subject Access Request" Icon={CircleCheckBig} />
            <StatCard
              label="Tribunal deadline"
              value="14 Jun"
              hint="ACAS EC by 03 May"
              Icon={CalendarClock}
              tone="warn"
            />
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent drafts</CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  View all <ArrowUpRight className="size-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-sidebar-border">
                {MOCK_DRAFTS.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/40 cursor-pointer">
                    <div className="size-8 rounded-md bg-muted/40 grid place-items-center">
                      <FileText className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.type}</div>
                      <div className="text-xs text-muted-foreground truncate">{d.recipient}</div>
                    </div>
                    <Badge className={STATUS_PILL[d.status]}>{d.status}</Badge>
                    <Badge className={RISK_PILL[d.risk]}>{d.risk}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                      {d.days}d ago
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <h3 className="text-sm font-medium mb-3">Quick start</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {FLAGSHIP_LETTERS.slice(0, 4).map((l) => (
              <Card key={l.id} className="cursor-pointer hover:border-foreground/30 transition-colors">
                <CardContent className="p-4">
                  <l.icon className="size-4 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium leading-tight mb-0.5">{l.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{l.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

/* ============================================================================
 *  VARIANT C — Console (information-dense dashboard)
 * ==========================================================================*/

function VariantC() {
  return (
    <div className="rounded-lg border border-sidebar-border bg-background overflow-hidden shadow-sm">
      <div className="grid grid-cols-[64px_1fr] min-h-[700px]">
        {/* Icon rail */}
        <aside className="border-r border-sidebar-border flex flex-col items-center py-3 gap-1">
          <div className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center mb-2">
            <ScrollText className="size-4" />
          </div>
          {[
            { Icon: Inbox, active: true },
            { Icon: PlusCircle, active: false },
            { Icon: History, active: false },
            { Icon: TrendingUp, active: false },
          ].map((it, i) => (
            <button
              key={i}
              className={`size-9 rounded-md grid place-items-center ${
                it.active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent"
              }`}
            >
              <it.Icon className="size-4" />
            </button>
          ))}
          <div className="flex-1" />
          <button className="size-9 rounded-md grid place-items-center text-muted-foreground hover:bg-sidebar-accent">
            <Sun className="size-4" />
          </button>
          <button className="size-9 rounded-md grid place-items-center text-muted-foreground hover:bg-sidebar-accent">
            <SettingsIcon className="size-4" />
          </button>
        </aside>

        {/* Dashboard */}
        <div data-page-main className="p-6 bg-muted/20 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Overview · Employee
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">Workspace</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Search className="size-3.5 mr-1.5" /> Search
              </Button>
              <Button size="sm">
                <PlusCircle className="size-3.5 mr-1.5" /> New letter
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total drafts" value="4" hint="2 in progress" Icon={FileText} />
            <StatCard label="Ready to export" value="1" hint="reviewed today" Icon={CircleCheckBig} />
            <StatCard
              label="Urgent deadlines"
              value="2"
              hint="<14 days"
              Icon={AlertTriangle}
              tone="warn"
            />
            <StatCard label="Letters this month" value="6" hint="+2 vs Apr" Icon={TrendingUp} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Drafts in progress</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground bg-muted/30">
                    <tr>
                      <th className="text-left py-2 px-4 font-normal">Letter</th>
                      <th className="text-left py-2 px-4 font-normal">Recipient</th>
                      <th className="text-left py-2 px-4 font-normal">Status</th>
                      <th className="text-left py-2 px-4 font-normal">Risk</th>
                      <th className="text-right py-2 px-4 font-normal">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sidebar-border">
                    {MOCK_DRAFTS.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/30 cursor-pointer">
                        <td className="py-2.5 px-4 font-medium">{d.type}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground truncate max-w-[14ch]">
                          {d.recipient}
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge className={STATUS_PILL[d.status]}>{d.status}</Badge>
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge className={RISK_PILL[d.risk]}>{d.risk}</Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right text-xs text-muted-foreground tabular-nums">
                          {d.days}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="size-4 text-amber-700" />
                  Upcoming deadlines
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Tribunal limitation periods calculated from your "date of act".
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DeadlineRow letter="Formal Grievance" deadline="14 Jun 2026" days={14} basis="ACAS EC by 03 May" />
                <DeadlineRow letter="Appeal letter" deadline="21 Jun 2026" days={21} basis="5 working days" />
              </CardContent>
            </Card>
          </div>

          <h3 className="text-sm font-medium mt-4 mb-3">Quick start</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {FLAGSHIP_LETTERS.slice(0, 4).map((l) => (
              <button
                key={l.id}
                className="rounded-md border border-sidebar-border bg-background p-3 text-left hover:border-foreground/30 transition-colors"
              >
                <l.icon className="size-4 text-muted-foreground mb-1.5" />
                <p className="text-xs font-medium leading-tight">{l.name}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeadlineRow({
  letter,
  deadline,
  days,
  basis,
}: {
  letter: string;
  deadline: string;
  days: number;
  basis: string;
}) {
  const tone = days < 14 ? "border-rose-200 bg-rose-50" : days < 30 ? "border-amber-200 bg-amber-50" : "border-letter-rule";
  return (
    <div className={`rounded-md border ${tone} p-2 text-xs`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-medium">{letter}</span>
        <span className="tabular-nums text-muted-foreground">{days}d</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Deadline {deadline} · {basis}
      </div>
    </div>
  );
}
