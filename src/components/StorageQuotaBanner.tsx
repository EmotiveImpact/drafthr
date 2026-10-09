import { useSyncExternalStore } from "react";
import { Callout } from "@radix-ui/themes";
import { HardDrive } from "lucide-react";
import {
  ASSUMED_QUOTA_BYTES,
  getStorageHealth,
  subscribeStorageHealth,
} from "@/lib/storage/quota-safe-storage";

/**
 * Persistent warning while this device's browser storage is nearly or
 * completely full. Unlike the one-off toast it stays visible for as long as
 * the condition holds, so it can't be missed after the first time.
 */
export function StorageQuotaBanner() {
  const health = useSyncExternalStore(subscribeStorageHealth, getStorageHealth, getStorageHealth);
  if (!health.full && !health.nearQuota) return null;
  const percent = Math.min(100, Math.round((health.usedBytes / ASSUMED_QUOTA_BYTES) * 100));
  return (
    <Callout.Root
      color={health.full ? "red" : "amber"}
      size="1"
      role="status"
      className="mx-4 mt-3"
      data-testid="storage-quota-banner"
    >
      <Callout.Icon>
        <HardDrive className="size-4" />
      </Callout.Icon>
      <Callout.Text>
        {health.full
          ? "Your browser storage is full, so recent changes may not be saved on this device. "
          : `Your browser storage is nearly full (about ${percent}%). `}
        Remove large letterhead or signature images, or export and delete old letters, to free space.
      </Callout.Text>
    </Callout.Root>
  );
}
