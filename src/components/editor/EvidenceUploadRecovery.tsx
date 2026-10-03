import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { findEvidenceUploads, type EvidenceRecovery } from "@/lib/storage/evidence-upload-recovery";

/** Mounted with the letter key so an old response cannot replace a new list. */
export function EvidenceUploadRecovery({ draftId }: { draftId: string }) {
  const generation = useRef(0);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<EvidenceRecovery | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => () => { generation.current++; }, []);

  const run = async (fileId?: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const token = generation.current;
    const active = () => token === generation.current;
    setMessage(fileId ? "Verifying and saving evidence…" : "Checking private uploads…");
    try {
      if (fileId) {
        if (!recovery) throw new Error("Check uploaded files again.");
        await recovery.attach(fileId);
        if (!active()) return;
        setRecovery({ ...recovery, files: recovery.files.filter(file => file.id !== fileId) });
        setMessage("Evidence attached and saved to the database.");
      } else {
        const found = await findEvidenceUploads(draftId, active);
        if (!active()) return;
        setRecovery(found);
        setMessage(found.files.length ? "Choose a file below. Nothing is reattached automatically." : "No unattached uploads found for this letter.");
      }
    } catch (error) {
      if (active()) setMessage(error instanceof Error ? error.message : "Upload recovery failed. Try again.");
    } finally {
      if (active()) { busyRef.current = false; setBusy(false); }
    }
  };

  return <details className="px-5 py-3 border-t border-border text-sm">
    <summary className="cursor-pointer">Missing an uploaded file?</summary>
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-muted-foreground">Find private uploads for this letter, including files previously removed from its evidence list. Incomplete transfers need the original file selected again through Upload new.</p>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run()}>Check uploaded files</Button>
      <p role="status" aria-live="polite">{message}</p>
      {recovery && recovery.files.length > 0 ? <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto">
        {recovery.files.map(file => <li key={file.id} className="flex flex-col gap-1">
          <span className="break-words">{file.filename}</span>
          <span className="text-xs text-muted-foreground">{file.size.toLocaleString()} bytes · {new Date(file.createdAt).toLocaleString()} · {file.status === "ready" ? "Upload verified" : "Awaiting verification"}</span>
          <Button type="button" variant="secondary" size="sm" disabled={busy} aria-label={`Attach ${file.filename}`} onClick={() => void run(file.id)}>
            {file.status === "ready" ? "Attach to letter" : "Verify and attach"}
          </Button>
        </li>)}
      </ul> : null}
    </div>
  </details>;
}
