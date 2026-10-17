import { useSyncExternalStore } from "react";
import { HardDrive } from "lucide-react";
import { Callout } from "@/components/wizard/kit";
import {
  ASSUMED_QUOTA_BYTES,
  getStorageHealth,
  subscribeStorageHealth,
} from "@/lib/storage/quota-safe-storage";

/**
 * Persistent warning while this device's browser storage is nearly or
 * completely full. Unlike the one-off toast it stays visible for as long as
 * the condition holds, so it can't be missed after the first time. A thin
 * kit callout: amber when nearly full, red when full.
 */
export function StorageQuotaBanner() {
  const health = useSyncExternalStore(subscribeStorageHealth, getStorageHealth, getStorageHealth);
  if (!health.full && !health.nearQuota) return null;
  const percent = Math.min(100, Math.round((health.usedBytes / ASSUMED_QUOTA_BYTES) * 100));
  return (
    <Callout
      tone={health.full ? "error" : "warning"}
      icon={HardDrive}
      role="status"
      data-testid="storage-quota-banner"
      className="mx-4 mt-3 min-w-0 py-2.5 sm:mx-8 lg:mx-12"
    >
      {health.full
        ? "Your browser storage is full, so recent changes may not be saved on this device. "
        : `Your browser storage is nearly full (about ${percent}%). `}
      Remove large letterhead or signature images, or export and delete old letters, to free space.
    </Callout>
  );
}
