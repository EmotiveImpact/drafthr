import type { Draft } from "../../../src/lib/letters/types.js";
import { toServerUuid } from "../../../src/lib/remote-ids.js";

const SECTION_STATUSES = new Set(["empty", "streaming", "ready", "edited"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the fields needed to persist and later render a complete draft.
 * Unknown future fields are retained in JSONB rather than silently dropped. */
export function isDraftSnapshot(value: unknown, serverId: string): value is Draft {
  if (!record(value)) return false;
  if (typeof value.id !== "string" || toServerUuid(value.id) !== serverId) return false;
  if (value.mode !== "employer" && value.mode !== "employee") return false;
  if (typeof value.letterType !== "string" || !value.letterType) return false;
  if (!record(value.context) || !record(value.employer) || !record(value.employee) || !record(value.answers)) return false;
  if (!Number.isSafeInteger(value.createdAt) || !Number.isSafeInteger(value.updatedAt)) return false;
  if (!Array.isArray(value.sections) || value.sections.length > 200) return false;
  if (value.evidence !== undefined && (!Array.isArray(value.evidence) || value.evidence.length > 200 ||
    !value.evidence.every(item => record(item) && typeof item.id === "string" && typeof item.kind === "string" &&
      typeof item.content === "string" && (item.fileId === undefined || typeof item.fileId === "string")))) return false;
  return value.sections.every((section: unknown) =>
    record(section) &&
    typeof section.id === "string" && section.id.length > 0 &&
    typeof section.sectionId === "string" && section.sectionId.length > 0 &&
    typeof section.title === "string" &&
    typeof section.html === "string" &&
    typeof section.required === "boolean" &&
    Array.isArray(section.versions) &&
    typeof section.status === "string" && SECTION_STATUSES.has(section.status)
  );
}

export function snapshotSections(snapshot: Draft) {
  return snapshot.sections.map((section, position) => ({
    sectionId: section.sectionId,
    title: section.title,
    html: section.html,
    status: section.status,
    position,
  }));
}
