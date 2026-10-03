import type { Draft } from "./letters/types";
import { toServerUuid } from "./remote-ids";
import type { WorkspaceEntity, WorkspaceKind } from "./workspace-documents";

/** Stable across lost acknowledgements/reloads. Original content timestamps
 * are retained; database creation metadata records when the copy was saved. */
export function workspaceRecoveryCopy(identity: string, kind: WorkspaceKind, source: WorkspaceEntity): WorkspaceEntity {
  if (kind === "preferences") throw new Error("Workspace settings cannot be recovered as a second settings record.");
  const copy = structuredClone(source);
  copy.id = toServerUuid(`workspace-recovery:${identity}:${kind}:${JSON.stringify(source)}`);
  if (kind === "drafts") {
    const draft = copy as Draft;
    draft.title = `${(draft.title || draft.letterType).slice(0, 450)} (recovered copy)`;
    draft.reviewStatus = "draft";
    delete draft.submittedForReviewAt; delete draft.reviewDecidedAt;
    draft.approvals = []; draft.exports = []; draft.timeline = []; draft.collaborators = [];
    // A recovered authoring draft must not update the old template implicitly.
    draft.isTemplateSource = false; delete draft.templateSourceId;
  }
  return copy;
}
