import { useEffect, useState } from "react";
import type { EvidenceItem } from "@/lib/letters/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { workspaceFileUrl } from "@/lib/storage/workspace-file-types";
import { Button } from "@/components/ui/button";

/** Object URLs are an ephemeral display buffer, never persisted into a draft. */
export function StoredEvidenceFile({ item }: { item: EvidenceItem }) {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.id, id = item.fileId;
  const isImage = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(item.mimeType ?? "");
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const key = `${tenantId}:${id}`;
  useEffect(() => {
    if (!id || !tenantId || !isImage) return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    void fetch(workspaceFileUrl(id, tenantId), { credentials: "same-origin", cache: "no-store", signal: abort.signal })
      .then(async response => {
        if (!response.ok) return;
        const blob = await response.blob();
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setImage({ key, url: objectUrl });
      }).catch(() => { /* Download remains available for explicit retry. */ });
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, tenantId, isImage, key]);
  if (!id || !tenantId) return null;
  return <div className="flex flex-col gap-2">
    {image?.key === key && <img src={image.url} alt={item.filename ?? "Evidence preview"} className="max-h-28 w-full object-contain" />}
    <Button size="xs" variant="outline" asChild><a href={workspaceFileUrl(id, tenantId)} download={item.filename}>Download original</a></Button>
  </div>;
}
