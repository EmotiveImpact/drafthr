import type { Draft } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { Box, Flex, Text } from "@radix-ui/themes";
import { ShieldAlert, Info, AlertTriangle, Scale } from "lucide-react";

type Variant = "danger" | "warn" | "muted";

const VARIANT: Record<Variant, { bg: string; border?: string; iconColor: string; textColor?: string }> = {
  danger: { bg: "var(--red-2)", border: "var(--red-6)", iconColor: "var(--red-11)", textColor: "var(--red-12)" },
  warn: { bg: "var(--amber-2)", border: "var(--amber-6)", iconColor: "var(--amber-11)", textColor: "var(--amber-12)" },
  muted: { bg: "var(--gray-2)", border: "var(--gray-5)", iconColor: "var(--gray-11)", textColor: "var(--gray-12)" },
};

function Banner({
  variant,
  icon,
  children,
}: {
  variant: Variant;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const v = VARIANT[variant];
  return (
    <Flex
      align="start"
      gap="3"
      p="3"
      style={{
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius: "var(--radius-3)",
        color: v.textColor,
      }}
    >
      <Box mt="1" style={{ color: v.iconColor }}>{icon}</Box>
      <Box className="flex-1 leading-relaxed text-xs">{children}</Box>
    </Flex>
  );
}

/**
 * Renders a tier-aware disclaimer banner inline in the editor (always visible
 * while drafting, not just at export). Item 14 in the production hardening list.
 */
export function InlineDisclaimer({ draft }: { draft: Draft }) {
  const meta = getLetterMeta(draft.letterType);
  const j = draft.context.jurisdiction;

  if (draft.mode === "employee") {
    const tribunalBound = Boolean(meta.tribunalBound);
    const counselReq = meta.legalReviewRequired;

    if (tribunalBound || counselReq) {
      return (
        <Banner variant="danger" icon={<Scale className="size-4" />}>
          <Text as="p" size="1" mb="1">
            <strong>Tribunal-bound letter.</strong> This letter may be disclosed in employment
            tribunal or court proceedings. Anything you write may be used as evidence by you or
            against you.
          </Text>
          <Text as="p" size="1">
            We strongly recommend a qualified employment{" "}
            {j === "UK" ? "solicitor" : "attorney"} reviews this letter before sending. Free
            advice: {j === "UK" ? "ACAS 0300 123 1100" : "EEOC 1-800-669-4000"}.
          </Text>
        </Banner>
      );
    }

    return (
      <Banner variant="muted" icon={<Info className="size-4" />}>
        <Text as="p" size="1">
          Drafted with an AI tool — not legal advice. Free advice:{" "}
          {j === "UK"
            ? "ACAS 0300 123 1100, Citizens Advice, Working Families."
            : "EEOC 1-800-669-4000, NLRB, your state DOL, lawhelp.org."}
        </Text>
      </Banner>
    );
  }

  // Employer mode
  if (meta.riskClass === "high") {
    return (
      <Banner variant="danger" icon={<ShieldAlert className="size-4" />}>
        <Text as="p" size="1" mb="1">
          <strong>High-risk letter.</strong> Counsel review is required before
          export.{" "}
          {j === "UK"
            ? "Failure to follow ACAS Code or s.86/98 ERA 1996 procedures may uplift tribunal awards by up to 25%."
            : "Failure to comply with WARN, OWBPA, Title VII, or state-specific final-pay rules can expose the organisation to penalties."}
        </Text>
        <Text as="p" size="1">
          This drafting assistant is not legal advice. The platform provider
          accepts no liability for content used without legal review.
        </Text>
      </Banner>
    );
  }

  if (meta.riskClass === "medium") {
    return (
      <Banner variant="warn" icon={<AlertTriangle className="size-4" />}>
        <Text as="p" size="1">
          <strong>Review recommended.</strong> This letter draws on general
          legal frameworks for {j}. Confirm compliance with your governing
          contract, applicable law, and any collective agreements before
          issuance.
        </Text>
      </Banner>
    );
  }

  return (
    <Banner variant="muted" icon={<Info className="size-4" />}>
      <Text as="p" size="1">
        Generated content should be reviewed by a qualified HR professional
        before issuance. Not legal advice.
      </Text>
    </Banner>
  );
}
