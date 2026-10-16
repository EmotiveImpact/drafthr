import type { Draft } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { AlertTriangle, Info, Scale, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The letter's tier-aware disclaimer (production hardening item 14). In the
 * workspace the quiet line "DraftHR drafts, you decide. Not legal advice."
 * sits in the ribbon; its info button opens this fuller text, which depends
 * on the letter's risk tier and mode (tribunal-bound employee letters carry
 * the free advice numbers; high-risk employer letters the counsel note).
 */
export type Disclaimer = {
  tone: "danger" | "warn" | "muted";
  icon: LucideIcon;
  title?: string;
  lines: string[];
};

export function disclaimerFor(draft: Draft): Disclaimer {
  const meta = getLetterMeta(draft.letterType);
  const j = draft.context.jurisdiction;

  if (draft.mode === "employee") {
    if (meta.tribunalBound || meta.legalReviewRequired) {
      return {
        tone: "danger",
        icon: Scale,
        title: "Tribunal-bound letter.",
        lines: [
          "This letter may be disclosed in employment tribunal or court proceedings. Anything you write may be used as evidence by you or against you.",
          `We strongly recommend a qualified employment ${j === "UK" ? "solicitor" : "attorney"} reviews this letter before sending. Free advice: ${
            j === "UK" ? "ACAS 0300 123 1100" : "EEOC 1-800-669-4000"
          }.`,
        ],
      };
    }
    return {
      tone: "muted",
      icon: Info,
      lines: [
        `Drafted with an AI tool. Not legal advice. Free advice: ${
          j === "UK"
            ? "ACAS 0300 123 1100, Citizens Advice, Working Families."
            : "EEOC 1-800-669-4000, NLRB, your state DOL, lawhelp.org."
        }`,
      ],
    };
  }

  if (meta.riskClass === "high") {
    return {
      tone: "danger",
      icon: ShieldAlert,
      title: "High-risk letter.",
      lines: [
        `Counsel review is required before export. ${
          j === "UK"
            ? "Failure to follow ACAS Code or s.86/98 ERA 1996 procedures may uplift tribunal awards by up to 25%."
            : "Failure to comply with WARN, OWBPA, Title VII, or state-specific final-pay rules can expose the organisation to penalties."
        }`,
        "This drafting assistant is not legal advice. The platform provider accepts no liability for content used without legal review.",
      ],
    };
  }

  if (meta.riskClass === "medium") {
    return {
      tone: "warn",
      icon: AlertTriangle,
      title: "Review recommended.",
      lines: [
        `This letter draws on general legal frameworks for ${j}. Confirm compliance with your governing contract, applicable law, and any collective agreements before issuance.`,
      ],
    };
  }

  return {
    tone: "muted",
    icon: Info,
    lines: ["Generated content should be reviewed by a qualified HR professional before issuance. Not legal advice."],
  };
}

/** The disclaimer as a small block (used in the ribbon's info pop-over). */
export function InlineDisclaimer({ draft, className }: { draft: Draft; className?: string }) {
  const d = disclaimerFor(draft);
  const Icon = d.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-[1.5]",
        d.tone === "danger"
          ? "bg-[var(--ds-red-soft)] text-[var(--ds-body)]"
          : d.tone === "warn"
            ? "bg-[var(--ds-amber-soft)] text-[var(--ds-body)]"
            : "bg-[var(--ds-surface-2)] text-[var(--ds-body)]",
        className
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          d.tone === "danger" ? "text-[var(--ds-red-fg)]" : d.tone === "warn" ? "text-[var(--ds-amber-fg)]" : "text-[var(--ds-muted)]"
        )}
      />
      <div className="min-w-0 space-y-1">
        {d.lines.map((l, i) => (
          <p key={i} className="m-0">
            {i === 0 && d.title ? <b className="font-medium text-[var(--ds-ink)]">{d.title} </b> : null}
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}
