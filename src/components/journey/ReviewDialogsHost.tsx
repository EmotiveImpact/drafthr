import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useJourneyUI } from "@/components/journey/ui-store";
import { REVIEW_KIND_LABELS, useReviewStore, type ReviewKind } from "@/lib/journey/reviews";

/**
 * Hosts the review dialogs (the "Who should review this letter?" picker and
 * the rest). Mounted once by JourneyPanel; open them through useJourneyUI.
 *
 * Working minimal placeholder from the foundation: pick the kind of
 * reviewer, name them, say what to look at, and send. The review builder
 * owns this file and replaces the body with the full picker (mock f2).
 */
export function ReviewDialogsHost() {
  const picker = useJourneyUI((s) => s.reviewPicker);
  const close = useJourneyUI((s) => s.closeReviewPicker);
  const createReview = useReviewStore((s) => s.createReview);
  const [kind, setKind] = useState<ReviewKind>("team");
  const [name, setName] = useState("");
  const [ask, setAsk] = useState("");

  useEffect(() => {
    if (!picker) return;
    setKind(picker.preset?.kind ?? "team");
    setName("");
    setAsk("");
  }, [picker]);

  const send = () => {
    if (!picker || !name.trim()) return;
    createReview({
      draftId: picker.draftId,
      kind,
      reviewer: { name: name.trim(), consultantId: kind === "expert" ? picker.preset?.expertId : undefined },
      ask,
      dueAt: picker.preset?.dueAt,
    });
    close();
  };

  return (
    <Dialog open={!!picker} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who should review this letter?</DialogTitle>
          <DialogDescription>Editing pauses while it is out for review.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as ReviewKind)} className="gap-2.5">
            {(Object.keys(REVIEW_KIND_LABELS) as ReviewKind[]).map((k) => (
              <Label key={k} className="flex items-center gap-2.5 font-normal">
                <RadioGroupItem value={k} />
                {REVIEW_KIND_LABELS[k]}
              </Label>
            ))}
          </RadioGroup>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="review-name">Reviewer's name</Label>
            <Input id="review-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="review-ask">What should they look at?</Label>
            <Textarea id="review-ask" value={ask} onChange={(e) => setAsk(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Send for review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
