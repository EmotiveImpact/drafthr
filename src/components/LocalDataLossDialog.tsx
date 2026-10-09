import { useEffect, useRef, useState } from "react";
import { AlertDialog, Button, Flex, Text } from "@radix-ui/themes";
import { Download } from "lucide-react";
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
 * confirmLocalDataLoss() drives it.
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

  return (
    <AlertDialog.Root open={Boolean(pending)} onOpenChange={(open) => !open && finish(false)}>
      <AlertDialog.Content maxWidth="460px">
        <AlertDialog.Title>
          {signingOut ? "Delete data stored only on this device?" : "Not enough space to keep this workspace's data"}
        </AlertDialog.Title>
        <AlertDialog.Description size="2">
          {signingOut
            ? "Signing out clears DraftHR from this browser. This has not been saved to your workspace and will be lost:"
            : "Your browser storage is too full to keep this workspace's data on this device while you switch. Switching now will delete:"}
        </AlertDialog.Description>
        <ul className="mt-3 mb-1 list-disc pl-5 text-sm leading-6" data-testid="local-data-loss-items">
          {pending?.summary.items.map((item) => <li key={item.label}>{item.label}</li>)}
          {pending?.summary.otherWorkspaces ? (
            <li>
              data kept for {pending.summary.otherWorkspaces} other workspace
              {pending.summary.otherWorkspaces === 1 ? "" : "s"}
            </li>
          ) : null}
        </ul>
        <Text as="p" size="2" color="gray" mt="2">
          Download a backup first if you might need it. On a shared computer, delete it so the next person can't see it.
        </Text>
        <Flex gap="3" mt="4" justify="end" wrap="wrap">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <Button
            variant="soft"
            onClick={() => {
              downloadLocalBackup();
              setDownloaded(true);
            }}
          >
            <Download className="size-4" />
            {downloaded ? "Backup downloaded" : "Download backup"}
          </Button>
          <Button color="red" onClick={() => finish(true)}>
            {signingOut ? "Sign out and delete" : "Switch and delete"}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
