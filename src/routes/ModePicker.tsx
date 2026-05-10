import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, UserRound, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";

export function ModePicker() {
  const nav = useNavigate();
  const drafts = useDraftStore((s) => s.drafts);
  const setRole = useProfileStore((s) => s.setRole);
  const draftList = Object.values(drafts).sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = draftList.slice(0, 3);

  const choose = (role: "employer" | "employee") => {
    setRole(role);
    nav(role === "employer" ? "/hr" : "/me");
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-12 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          HR Letter Platform
        </p>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">
          Who are you writing as?
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Pick one. We'll save your role and adapt the platform around it. You can change it any
          time in <button className="underline" onClick={() => nav("/settings")}>Settings</button>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
        <Card
          className="cursor-pointer group hover:border-foreground/30 transition-colors"
          onClick={() => choose("employer")}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="size-10 rounded-md bg-foreground/5 grid place-items-center mb-2">
                <Briefcase className="size-5" />
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
            </div>
            <CardTitle>I'm in HR or management</CardTitle>
            <CardDescription className="leading-relaxed">
              Drafting letters TO an employee — offers, terminations, warnings, redundancies,
              references. The platform helps you comply with ACAS, s.98 ERA, WARN, OWBPA, COBRA,
              and state-specific final-pay rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5 pt-0">
            <p>14 letter types · UK + US · Counsel-review gate on high-risk letters</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer group hover:border-foreground/30 transition-colors"
          onClick={() => choose("employee")}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="size-10 rounded-md bg-foreground/5 grid place-items-center mb-2">
                <UserRound className="size-5" />
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
            </div>
            <CardTitle>I'm an employee</CardTitle>
            <CardDescription className="leading-relaxed">
              Drafting letters TO HR or your employer — grievances, resignations, flexible-working
              requests, SARs, appeals, whistleblowing, accommodation requests. The platform helps
              you preserve your rights and not prejudice future claims.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5 pt-0">
            <p>21 letter types · UK + US · Tribunal-deadline tracking · Register-safety check</p>
          </CardContent>
        </Card>
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-medium tracking-tight text-foreground mb-3">
            Or jump back into a recent draft
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {recent.map((d) => (
              <Button
                key={d.id}
                variant="outline"
                className="justify-start h-auto py-3 text-left"
                onClick={() => nav(`/editor/${d.id}`)}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {d.mode === "employer" ? "HR" : "Employee"} · {d.context.jurisdiction}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {d.letterType.replace(/_/g, " ")}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
