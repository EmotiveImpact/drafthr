import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/Badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ArrowUpRight } from "lucide-react";
import { letterCatalogByMode } from "@/lib/letters/catalog";
import type { Mode } from "@/lib/letters/types";

const RISK_PILL: Record<string, string> = {
  low: "bg-green-50 text-green-800 border-green-200",
  medium: "bg-amber-50 text-amber-900 border-amber-200",
  high: "bg-rose-50 text-rose-900 border-rose-200",
};

/**
 * Full catalogue browse page reached from the sidebar's "New letter" entry.
 *
 * Two sections:
 *   - Flagship letters (the shortlist)
 *   - All letter types (the long list, searchable)
 */
export function BrowseLetters({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");

  const catalog = useMemo(() => letterCatalogByMode(mode), [mode]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return catalog;
    return catalog.filter(
      (l) =>
        l.title.toLowerCase().includes(t) ||
        l.shortTitle.toLowerCase().includes(t) ||
        l.description.toLowerCase().includes(t)
    );
  }, [catalog, q]);

  const flagship = filtered.filter((l) => l.flagshipV1);
  const more = filtered.filter((l) => !l.flagshipV1);
  const prefix = mode === "employer" ? "/hr" : "/me";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => nav(prefix)}
            className="text-muted-foreground -ml-3 mb-2 h-7"
          >
            <ChevronLeft className="size-3.5 mr-1" /> Home
          </Button>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
            New letter · {mode === "employer" ? "HR / Management" : "Employee"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            Browse letter types
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {mode === "employer"
              ? "14 letter types covering hiring, performance, separation, and immigration. UK + US legal language baked in."
              : "21 letter types covering grievances, resignation, accommodation, whistleblowing, and tribunal-bound cover. UK + US rights-preservation language baked in."}
          </p>
        </div>
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search letters…"
            className="pl-8 h-9 w-full sm:w-64"
          />
        </div>
      </div>

      {flagship.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-3">Flagship letters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {flagship.map((l) => (
              <Card
                key={l.id}
                className="cursor-pointer group hover:border-foreground/30 transition-colors"
                onClick={() => nav(`${prefix}/new/${l.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between mb-1">
                    <Badge className={RISK_PILL[l.riskClass]}>{l.riskClass} risk</Badge>
                    <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <CardTitle className="text-base leading-snug">{l.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{l.description}</CardDescription>
                </CardHeader>
                {l.badge && (
                  <CardContent className="-mt-2 pb-5">
                    <span className="text-xs text-rose-700 font-medium">⚠ {l.badge}</span>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {more.length > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-3">More letter types</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {more.map((l) => (
              <Card
                key={l.id}
                className="cursor-pointer hover:border-foreground/30 transition-colors"
                onClick={() => nav(`${prefix}/new/${l.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium">{l.shortTitle}</span>
                    <Badge className={RISK_PILL[l.riskClass]}>{l.riskClass}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {l.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-letter-rule p-8 text-center text-sm text-muted-foreground">
          No letters matched <strong>"{q}"</strong>. Try a different keyword, or browse the
          full catalogue.
        </div>
      )}
    </div>
  );
}
