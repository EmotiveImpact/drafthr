import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Draft } from "@/lib/letters/types";
import { getLetterMeta } from "@/lib/letters/catalog";
import { ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = {
  draft: Draft;
  open: boolean;
  onClose: () => void;
  onConfirm: (review: { reviewedBy: string; reviewedOn: string }) => void;
};

/**
 * Item 15 — High-risk export gate. Forces an explicit "qualified reviewer
 * confirmed this" attestation before high-risk letters (termination,
 * redundancy, settlement, immigration) can be exported.
 */
export function HighRiskExportGate({ draft, open, onClose, onConfirm }: Props) {
  const meta = getLetterMeta(draft.letterType);
  const [reviewedBy, setReviewedBy] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [reviewedOn, setReviewedOn] = useState(today);
  const [confirmed, setConfirmed] = useState(false);

  const canProceed = reviewedBy.trim().length >= 2 && reviewedOn && confirmed;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-rose-600" />
            Counsel review required
          </DialogTitle>
          <DialogDescription>
            <strong>{meta.title}</strong> is classified as a high-risk
            communication. Before exporting, please confirm a qualified employment-law
            reviewer has approved the content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900 leading-relaxed">
            {draft.context.jurisdiction === "UK" ? (
              <>
                The ACAS Code of Practice and Employment Rights Act 1996
                governing this letter type carry compensation uplifts of up to
                25% for procedural failures (s.207A TULRCA 1992). Settlement
                agreements specifically require independent legal advice (s.203
                ERA) to be valid.
              </>
            ) : (
              <>
                US employment law (WARN Act, OWBPA, Title VII, ADA, ADEA, plus
                state-specific final-pay and notice rules) imposes statutory
                penalties for non-compliant separations. CA and NY in particular
                impose strict same-day or next-day final-pay rules.
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reviewedBy" className="text-xs">
                Reviewed by (name & role)
              </Label>
              <Input
                id="reviewedBy"
                placeholder="e.g. J. Smith, Employment Counsel"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reviewedOn" className="text-xs">
                Review date
              </Label>
              <Input
                id="reviewedOn"
                type="date"
                value={reviewedOn}
                onChange={(e) => setReviewedOn(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-letter-rule p-3 cursor-pointer hover:bg-accent/40">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs leading-relaxed">
              I confirm a qualified employment-law professional has reviewed
              this letter and approved its content for issuance. I understand
              this attestation will be embedded in the export metadata for audit.
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canProceed}
            onClick={() => onConfirm({ reviewedBy: reviewedBy.trim(), reviewedOn })}
          >
            Confirm and export
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
