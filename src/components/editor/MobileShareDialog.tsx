import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string;
};

/**
 * "Open on mobile" share dialog — surfaces the `/m/:draftId` link so the
 * user can open the read-only mobile view on their phone. Pure link UX:
 * we deliberately skip the QR code rendering because adding the `qrcode`
 * dep for one nice-to-have isn't worth the bundle cost — the URL + copy
 * button is the actual feature.
 *
 * Auth still applies on the receiving device: the recipient must be
 * signed into the same workspace to open the link.
 */
export function MobileShareDialog({ open, onOpenChange, draftId }: Props) {
  const [copied, setCopied] = useState(false);

  // Build the absolute URL from the current origin so the link works when
  // pasted into another tab / sent in chat. window is unavailable during
  // SSR, but this whole tree is CSR-only in DraftHR.
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/m/${draftId}`
      : `/m/${draftId}`;

  // Reset the "Copied" confirmation when the dialog re-opens.
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const onCopy = async () => {
    try {
      // navigator.clipboard isn't always available (iOS Safari over http,
      // older webviews). Fall back to a one-shot textarea hack.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Best-effort — surface the URL anyway so the user can long-press.
      setCopied(false);
    }
  };

  const onOpenLink = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="mobile-share-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-4 text-[var(--ds-muted)]" />
            Read this letter on your phone
          </DialogTitle>
          <DialogDescription>
            Open this link on your phone for a chromeless, scrollable view of
            the letter. No editing, just clean reading.
          </DialogDescription>
        </DialogHeader>

        <div
          className="rounded-md border border-[var(--ds-line)] bg-[var(--ds-surface-2)] px-3 py-2 text-[12px] font-mono text-[var(--ds-body)] break-all select-all"
          data-testid="mobile-share-url"
        >
          {url}
        </div>

        <DialogFooter className="flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCopy}
            data-testid="mobile-share-copy"
          >
            {copied ? (
              <>
                <Check className="size-3.5 mr-1.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5 mr-1.5" /> Copy link
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onOpenLink}
            data-testid="mobile-share-open"
          >
            <ExternalLink className="size-3.5 mr-1.5" /> Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
