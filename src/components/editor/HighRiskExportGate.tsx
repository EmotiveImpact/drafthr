import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Draft } from "@/lib/letters/types";
import { briefTitleFor } from "@/lib/letters/display";
import { todayDateOnly } from "@/lib/date-only";
import { ShieldAlert } from "lucide-react";

type Props = {
  draft: Draft;
  open: boolean;
  onClose: () => void;
  onConfirm: (review: { reviewedBy: string; reviewedOn: string }) => void;
};

/**
 * Item 15: high-risk export gate. Forces an explicit "qualified reviewer
 * confirmed this" attestation before high-risk letters (termination,
 * redundancy, settlement, immigration) can be exported.
 */
export function HighRiskExportGate({ draft, open, onClose, onConfirm }: Props) {
  const [reviewedBy, setReviewedBy] = useState("");
  const today = todayDateOnly();
  const [reviewedOn, setReviewedOn] = useState(today);
  const [confirmed, setConfirmed] = useState(false);

  const canProceed = reviewedBy.trim().length >= 2 && reviewedOn && confirmed;

  const field =
    "h-9 w-full rounded-[9px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-3 text-[13.5px] text-[var(--ds-ink)] outline-none transition-colors duration-[120ms] placeholder:text-[var(--ds-subtle)] focus:border-[var(--ds-line-strong)] focus-visible:shadow-[var(--ds-focus-ring)]";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-[var(--ds-amber-fg)]" />
            Counsel review required
          </DialogTitle>
          <DialogDescription>
            <strong className="font-medium text-[var(--ds-ink)]">{briefTitleFor(draft)}</strong> is a high-risk letter. Before
            exporting, confirm a qualified employment-law reviewer has approved the content.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* A legal note, not an error: the calm neutral fill (red is for
              errors and failing checks only). */}
          <div className="rounded-[10px] border border-[var(--ds-line)] bg-[var(--ds-surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--ds-body)]">
            {draft.context.jurisdiction === "UK" ? (
              <>
                The ACAS Code of Practice and Employment Rights Act 1996 governing this letter type carry compensation
                uplifts of up to 25% for procedural failures (s.207A TULRCA 1992). Settlement agreements specifically
                require independent legal advice (s.203 ERA) to be valid.
              </>
            ) : (
              <>
                US employment law (WARN Act, OWBPA, Title VII, ADA, ADEA, plus state-specific final-pay and notice
                rules) imposes statutory penalties for non-compliant separations. CA and NY in particular impose strict
                same-day or next-day final-pay rules.
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="reviewedBy" className="mb-1 block text-[12.5px] font-medium text-[var(--ds-muted)]">
                Reviewed by (name and role)
              </label>
              <input
                id="reviewedBy"
                placeholder="For example J. Smith, Employment Counsel"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="reviewedOn" className="mb-1 block text-[12.5px] font-medium text-[var(--ds-muted)]">
                Review date
              </label>
              <input
                id="reviewedOn"
                type="date"
                value={reviewedOn}
                onChange={(e) => setReviewedOn(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-[var(--ds-line)] p-3 transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)]">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--ds-accent)]"
            />
            <span className="text-[12.5px] leading-relaxed text-[var(--ds-body)]">
              I confirm a qualified employment-law professional has reviewed this letter and approved its content for
              issue. I understand this attestation will be embedded in the export metadata for audit.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canProceed} onClick={() => onConfirm({ reviewedBy: reviewedBy.trim(), reviewedOn })}>
            Confirm and export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
