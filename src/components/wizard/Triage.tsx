import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Phone,
  ShieldAlert,
} from "lucide-react";
import { getLetterMeta } from "@/lib/letters/catalog";
import type { LetterTypeId, Jurisdiction } from "@/lib/letters/types";

type TriageScore = "strong" | "moderate" | "weak";

const FREE_ADVICE_UK = [
  { label: "ACAS helpline", phone: "0300 123 1100", url: "https://www.acas.org.uk/" },
  { label: "Citizens Advice", url: "https://www.citizensadvice.org.uk/" },
  { label: "Equality Advisory & Support Service", url: "https://www.equalityadvisoryservice.com/" },
  { label: "Working Families", url: "https://workingfamilies.org.uk/" },
  { label: "Law Centres Network", url: "https://www.lawcentres.org.uk/" },
];

const FREE_ADVICE_US = [
  { label: "EEOC", phone: "1-800-669-4000", url: "https://www.eeoc.gov/" },
  { label: "NLRB", url: "https://www.nlrb.gov/" },
  { label: "Department of Labor (state directory)", url: "https://www.dol.gov/" },
  { label: "Legal aid (lawhelp.org)", url: "https://www.lawhelp.org/" },
  { label: "National Employment Lawyers Association", url: "https://www.nelahq.org/" },
];

/**
 * Triage step shown before high-risk EMPLOYEE letters. Two questions:
 *   1. How strong is the evidence?
 *   2. Is informal escalation still possible?
 *
 * If the triage score is "weak", we softly recommend free advice services
 * before drafting — but we never block the user.
 */
export function Triage({
  letterType,
  jurisdiction,
  onSkip,
  onContinue,
}: {
  letterType: LetterTypeId;
  jurisdiction: Jurisdiction;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const meta = getLetterMeta(letterType);
  const [evidence, setEvidence] = useState<"strong" | "some" | "thin" | undefined>();
  const [informal, setInformal] = useState<"yes" | "no" | "unsafe" | "tried" | undefined>();
  const advice = jurisdiction === "UK" ? FREE_ADVICE_UK : FREE_ADVICE_US;

  const score: TriageScore | null =
    evidence && informal
      ? evidence === "strong" || (evidence === "some" && informal === "tried")
        ? "strong"
        : evidence === "thin" && informal === "no"
        ? "weak"
        : "moderate"
      : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Triage</p>
          <Badge className="bg-rose-50 text-rose-900 border-rose-200">High-risk letter</Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Let's pause for 30 seconds before drafting.
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {meta.title} is a high-risk letter — what you write may be disclosed in tribunal or
          court proceedings. A quick check helps you decide whether to draft now, get advice
          first, or pursue a different route.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evidence</CardTitle>
          <CardDescription>
            How strong is your factual record — dates, named witnesses, written evidence?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={evidence} onValueChange={(v) => setEvidence(v as typeof evidence)} className="space-y-1.5">
            <TriageOption value="strong" label="Strong — I have specific dates, named witnesses, and written evidence (emails, policies, photos)." current={evidence} />
            <TriageOption value="some" label="Some — I have most of the dates and a few witnesses or documents." current={evidence} />
            <TriageOption value="thin" label="Thin — it's mostly my word; I don't have dates or witnesses pinned down." current={evidence} />
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Informal route</CardTitle>
          <CardDescription>
            Have you tried to resolve this informally with your manager or HR first?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={informal} onValueChange={(v) => setInformal(v as typeof informal)} className="space-y-1.5">
            <TriageOption value="tried" label="Yes, tried and it didn't resolve." current={informal} />
            <TriageOption value="no" label="No — I haven't raised it informally yet." current={informal} />
            <TriageOption value="unsafe" label="It wouldn't be safe / appropriate to raise informally (harassment, retaliation, safety)." current={informal} />
            <TriageOption value="yes" label="Yes, and I'm waiting on a response." current={informal} />
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Outcome message */}
      {score && (
        <div className="mb-6 space-y-3">
          {score === "strong" && (
            <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-900 leading-relaxed">
              <ShieldAlert className="size-4 mt-0.5 shrink-0" />
              <p>
                <strong>You're well-positioned to draft.</strong> Specific facts, named
                witnesses, and a documented attempt to resolve informally are exactly what a
                tribunal panel looks for. Continue — and consider counsel review before sending.
              </p>
            </div>
          )}
          {score === "moderate" && (
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <p>
                <strong>Proceed, but pin down the gaps.</strong> Before sending, try to fix
                specific dates and identify any witnesses. Vague chronology weakens your
                position. Free advice helplines (below) can help you sharpen the record.
              </p>
            </div>
          )}
          {score === "weak" && (
            <div className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 leading-relaxed">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <p>
                <strong>Strongly recommended: get advice first.</strong> A high-risk letter
                without dates, witnesses, or an informal-route attempt is harder to act on and
                can be cited against you. Talk to one of the free services below before
                drafting. You can come back any time.
              </p>
            </div>
          )}

          <details className="rounded-md border border-letter-rule p-3 text-xs">
            <summary className="cursor-pointer font-medium text-foreground">
              Free advice — {jurisdiction === "UK" ? "UK" : "US"}
            </summary>
            <ul className="mt-2 space-y-1.5">
              {advice.map((a) => (
                <li key={a.label} className="flex items-center gap-2 text-muted-foreground">
                  {a.phone && <Phone className="size-3 shrink-0" />}
                  <span>{a.label}</span>
                  {a.phone && <span className="font-mono">{a.phone}</span>}
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 underline"
                  >
                    visit
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip triage
        </Button>
        <Button onClick={onContinue} disabled={!evidence || !informal}>
          Continue to drafting
          <ChevronRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function TriageOption({
  value,
  label,
  current,
}: {
  value: string;
  label: string;
  current: string | undefined;
}) {
  const id = `tri-${value}`;
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2 rounded-sm p-2 cursor-pointer hover:bg-accent/40 ${
        current === value ? "bg-accent/60" : ""
      }`}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="text-sm leading-relaxed">{label}</span>
    </label>
  );
}
