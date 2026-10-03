import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { recoverWorkspaceConflictAsCopy, resolveWorkspaceConflict, reviewWorkspaceRecoveryLinks, workspaceFileContext, type WorkspaceConflict, type WorkspaceRecoveryLinkReview } from "@/lib/database-workspace";
import type { RecoveryLinkChoices } from "@/lib/workspace-recovery-links";

export function WorkspaceRecoveryAction({ conflict, busy, action, onRecovered }: {
  conflict: WorkspaceConflict; busy: boolean;
  action: (work: () => Promise<unknown>) => Promise<void>;
  onRecovered: (id: string) => Promise<void>;
}) {
  const [review, setReview] = useState<WorkspaceRecoveryLinkReview>();
  const [choices, setChoices] = useState<RecoveryLinkChoices>({});
  const createsCopy = !!conflict.latest.deletedAt;
  const mounted = useRef(true), running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = (work: () => Promise<unknown>) => {
    if (running.current || busy) return;
    running.current = true;
    void action(work).finally(() => { running.current = false; });
  };
  const check = async () => {
    const scope = workspaceFileContext();
    const result = await reviewWorkspaceRecoveryLinks(conflict);
    if (!scope.isCurrent() || !mounted.current) return;
    setReview(result); setChoices({});
    return result;
  };
  return <div className="flex flex-col gap-3">
    {review && review.issues.length > 0 && <fieldset className="flex flex-col gap-3" disabled={busy}>
      <legend>Resolve unavailable linked records</legend>
      <p>Choose an existing record, or explicitly remove an optional link. Names, letter text and evidence remain unchanged. Check that the selected person or matter is correct before reviewing the recovered letter.</p>
      {!createsCopy && conflict.operation.kind === "drafts" && <p>Changing a link returns this letter to draft and clears its current approval. Historical exports remain available; review and export the changed letter again.</p>}
      {review.issues.map(issue => <section key={issue.key} className="flex flex-col gap-2">
        <Label htmlFor={`recovery-link-${conflict.operation.id}-${issue.key}`}>{issue.label} — {issue.id}</Label>
        <Select disabled={busy} value={choices[issue.key] === null ? "__unlink__" : choices[issue.key] ?? ""}
          onValueChange={value => setChoices(previous => ({ ...previous, [issue.key]: value === "__unlink__" ? null : value }))}>
          <SelectTrigger id={`recovery-link-${conflict.operation.id}-${issue.key}`}><SelectValue placeholder="Choose a recovery link" /></SelectTrigger>
          <SelectContent><SelectGroup>
            {!issue.required && <SelectItem value="__unlink__">Remove this link; keep all copied content</SelectItem>}
            {issue.candidates.map(row => <SelectItem key={row.id} value={row.id}>{row.label} · {row.id}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
        {issue.required && !issue.candidates.length && <p>No available matter. Create or recover the correct matter first, then check linked records again. Your pending edit remains available.</p>}
      </section>)}
    </fieldset>}
    {review && <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(check)}>Check linked records again</Button>}
    <Button variant="outline" size="sm" disabled={busy || !!review?.issues.some(issue => choices[issue.key] === undefined || (issue.required && choices[issue.key] === null))}
      onClick={() => run(async () => {
        const checked = review ?? await check();
        if (!checked || (!review && checked.issues.length)) return;
        const scope = workspaceFileContext();
        const resolution = checked.issues.length ? { review: checked, choices } : undefined;
        let id = conflict.operation.id;
        if (createsCopy) id = resolution ? await recoverWorkspaceConflictAsCopy(conflict, resolution) : await recoverWorkspaceConflictAsCopy(conflict);
        else await resolveWorkspaceConflict(conflict, "mine", resolution);
        if (scope.isCurrent() && mounted.current) await onRecovered(id);
      })}>{createsCopy ? "Recover my edit as a new record" : "Save my version over this database version"}</Button>
  </div>;
}
