import type { CustomTemplate, Draft } from "./letters/types";
import { useDraftStore } from "./store";
import { isDatabaseWorkspaceEnabled } from "./workspace-flags";
import { confirmSavedWorkspaceTemplate, savedWorkspaceDraft, workspaceFileContext } from "./database-workspace";
import { workspaceRecordSchemas } from "./workspace-records";
import { recordsEqual } from "./record-equality";

/** Both template entry points use this boundary. The caller retains templateId
 * on failure: retrying a lost acknowledgement must not create another record. */
export async function saveDraftAsTemplate(input: {
  draft: Draft; templateId: string; name: string; description?: string;
  linkSource?: boolean; isCurrent?: () => boolean;
}): Promise<CustomTemplate> {
  const scope = isDatabaseWorkspaceEnabled() ? workspaceFileContext() : undefined;
  const source = structuredClone(input.draft);
  const previous = useDraftStore.getState().customTemplates[input.templateId];
  const assertCurrent = () => {
    if ((scope && !scope.isCurrent()) || input.isCurrent?.() === false) throw new Error("Workspace or editor changed. Reopen the draft before saving its template.");
    const state = useDraftStore.getState();
    if (!recordsEqual(state.drafts[source.id], source)) throw new Error("The draft changed while preparing the template. Save it again to capture the current text.");
    if (!recordsEqual(state.customTemplates[input.templateId], previous)) throw new Error("The template changed while saving. Review the newer version before trying again.");
  };
  assertCurrent();
  // Evidence references are specific to this letter. Templates deliberately
  // do not copy its evidence bundle into every future employee's letter.
  // Stop before uploads or queued writes rather than producing dangling refs
  // or silently stripping the author's text.
  for (const section of source.sections) {
    const root = document.createElement("template");
    root.innerHTML = section.html;
    if (root.content.querySelector("[data-fig-id], [data-att-id], .figure-ref, .attachment-ref")) {
      throw new Error("This letter contains evidence references that belong to this draft. Replace those references with reusable wording before saving a template. Your letter and evidence are unchanged.");
    }
  }
  if (scope) { await savedWorkspaceDraft(input.draft); assertCurrent(); }
  const sectionHtml: CustomTemplate["sectionHtml"] = {};
  for (const section of source.sections) if (section.html.trim()) sectionHtml[section.sectionId] = section.html;
  if (!Object.keys(sectionHtml).length) throw new Error("Add some section text before saving a template.");
  let template: CustomTemplate = {
    ...previous, id: input.templateId, createdAt: previous?.createdAt ?? Date.now(), updatedAt: Date.now(),
    name: input.name.trim(), description: input.description?.trim() || undefined,
    baseLetterType: source.letterType, mode: source.mode, jurisdiction: source.context.jurisdiction,
    sectionHtml, answers: source.answers,
  };
  if (scope) {
    const { importTemplateAssets, legacyAssetUploader } = await import("./storage/legacy-asset-import");
    assertCurrent();
    template = await importTemplateAssets(template, legacyAssetUploader({ tenantId: scope.tenantId, isCurrent: () => { assertCurrent(); return true; } }));
  }
  workspaceRecordSchemas.templates.parse(template);
  assertCurrent();
  // One local update registers the source link and template together. The
  // coordinator writes the template before the dependent draft and retains
  // either pending operation after an interrupted save.
  useDraftStore.setState(state => ({ customTemplates: { ...state.customTemplates, [template.id]: template },
    ...(input.linkSource ? { drafts: { ...state.drafts, [source.id]: { ...state.drafts[source.id], templateSourceId: template.id, updatedAt: Date.now() } } } : {}) }));
  if (scope) {
    await confirmSavedWorkspaceTemplate(template);
    if (!scope.isCurrent()) throw new Error("Workspace changed. The template belongs to its original workspace.");
  }
  return template;
}
