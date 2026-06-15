import { useParams, Link } from "react-router-dom";
import { LetterEditor } from "pagedly";
import "pagedly/styles.css";
import { useDraftStore } from "@/lib/store";
import { toLetterDraft } from "@/lib/letters/toLetterDraft";

/**
 * /pagedly/:draftId — renders the live draft in the pagedly paged editor
 * (Word-style "Print Layout": content flows across visible A4 pages, with
 * letterhead/signature and native print).
 *
 * This is the first, isolated integration of the vendored pagedly plugin: it
 * reads the draft from the store, maps it to pagedly's LetterDraft, and writes
 * per-section edits back through the store's updateSection. The main editor is
 * untouched — this is a parallel surface to validate pagedly on real data
 * before deciding whether it replaces the home-grown paged engine.
 */
export function PagedlyEditor() {
  const { draftId } = useParams<{ draftId: string }>();
  const draft = useDraftStore((s) => (draftId ? s.drafts[draftId] : undefined));
  const updateSection = useDraftStore((s) => s.updateSection);

  if (!draft) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <p className="text-[15px] font-semibold text-[var(--ds-ink)]">Draft not found.</p>
          <Link
            to="/"
            className="mt-3 inline-block text-[13px] font-semibold text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
          >
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ds-canvas)]">
      <LetterEditor
        draft={toLetterDraft(draft)}
        toolbar
        toolbarPosition="sticky"
        onSectionChange={(dId, sid, html) => {
          // pagedly identifies the section by either its id or sectionId; the
          // store matches by the app Section.id, so resolve robustly.
          const d = useDraftStore.getState().drafts[dId];
          const sec = d?.sections.find((s) => s.id === sid || s.sectionId === sid);
          if (sec) updateSection(dId, sec.id, html);
        }}
      />
    </div>
  );
}
