import { useEffect, useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KitDialogContent, KitDialogFooter } from "@/components/wizard/kit";
import {
  downloadLocalBackup,
  setLocalDataLossPresenter,
  type LocalDataLossReason,
  type LocalDataSummary,
} from "@/lib/session/localDataGuard";

type Pending = {
  summary: LocalDataSummary;
  reason: LocalDataLossReason;
  resolve: (proceed: boolean) => void;
};

/**
 * Confirm before signing out (or switching workspace without room to keep the
 * current one) would delete data that only lives on this device. Lists what
 * would go and offers a JSON backup first. Mounted once near the app root;
 * confirmLocalDataLoss() drives it. A kit dialog: Esc, the overlay and
 * Cancel all resolve as cancel.
 */
export function LocalDataLossDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  useEffect(() => {
    setLocalDataLossPresenter(
      (summary, reason) =>
        new Promise<boolean>((resolve) => {
          // A second request while one is open cancels the first.
          pendingRef.current?.resolve(false);
          setDownloaded(false);
          setPending({ summary, reason, resolve });
        }),
    );
    return () => setLocalDataLossPresenter(null);
  }, []);

  const finish = (proceed: boolean) => {
    pending?.resolve(proceed);
    setPending(null);
  };

  const signingOut = pending?.reason !== "switch";
  const others = pending?.summary.otherWorkspaces ?? 0;

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && finish(false)}>
      <KitDialogContent showCloseButton={false} className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {signingOut ? "Delete data stored only on this device?" : "Not enough space to keep this workspace's data"}
          </DialogTitle>
          <DialogDescription>
            {signingOut
              ? "Signing out clears DraftHR from this browser. This has not been saved to your workspace and will be lost:"
              : "Your browser storage is too full to keep this workspace's data on this device while you switch. Switching now will delete:"}
          </DialogDescription>
        </DialogHeader>
        <ul
          className="m-0 list-disc rounded-[12px] bg-[var(--ds-surface-2)] py-3 pl-8 pr-4 text-[14px] leading-6 text-[var(--ds-ink)]"
          data-testid="local-data-loss-items"
        >
          {pending?.summary.items.map((item) => <li key={item.label}>{item.label}</li>)}
          {others ? (
            <li>
              data kept for {others} other workspace{others === 1 ? "" : "s"}
            </li>
          ) : null}
        </ul>
        <p className="m-0 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">
          Download a backup first if you might need it. On a shared computer, delete it so the next person can't see it.
        </p>
        <KitDialogFooter className="flex-wrap">
          <Button variant="outline" onClick={() => finish(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              downloadLocalBackup();
              setDownloaded(true);
            }}
          >
            {downloaded ? <Check className="size-4" /> : <Download className="size-4" />}
            {downloaded ? "Backup downloaded" : "Download backup"}
          </Button>
          <Button
            onClick={() => finish(true)}
            className="border-0 bg-[var(--ds-red-solid)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-red-fg)] active:bg-[var(--ds-red-fg)]"
          >
            {signingOut ? "Sign out and delete" : "Switch and delete"}
          </Button>
        </KitDialogFooter>
      </KitDialogContent>
    </Dialog>
  );
}
