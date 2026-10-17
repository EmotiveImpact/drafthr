import type { DraftTimelineItem } from "@/lib/timeline";
import { formatDateOnly } from "@/lib/date-only";
import { sentForApprovalTitle } from "@/components/journey/send/record";

const FORMAT_WORDS: Record<string, string> = {
  pdf: "Downloaded as PDF",
  docx: "Downloaded as Word",
  txt: "Downloaded as plain text",
  pack: "Downloaded the evidence pack",
  audit: "Downloaded the audit record",
  "marked-sent": "Marked as sent",
};

/** How close a "marked-sent" export sits to the send it records. */
const SAME_SEND_MS = 2 * 60 * 1000;

/**
 * The letter's timeline as people read it in Activity: downloads named in
 * words ("Downloaded the evidence pack", not "Exported as PACK"), one row
 * per send (the "marked-sent" export behind "Handed over in person" is not
 * listed again), the counsel attestation once on the download it came with
 * rather than as a second row each time, dates in words, and DraftHR named.
 */
export function readableTimeline(events: DraftTimelineItem[]): DraftTimelineItem[] {
  const sendEvents = events.filter((e) => e.kind === "details_updated" && e.meta?.action === "sent");
  const sends = sendEvents.map((e) => e.createdAt);
  // A back-dated send's export is timed at the date given; its send entry
  // names that time (meta.sentExportAt) and is the one row for the send, at
  // the time it was recorded (SEND-X2).
  const sendExportAts = new Set(
    sendEvents.map((e) => e.meta?.sentExportAt).filter((at): at is number => typeof at === "number")
  );
  const exportIds = new Set(events.filter((e) => e.kind === "exported").map((e) => String(e.meta?.exportId ?? "")));
  const out: DraftTimelineItem[] = [];
  const seenAttestations = new Set<string>();
  for (const e of events) {
    if (e.kind === "exported") {
      const format = String(e.meta?.format ?? "");
      if (
        format === "marked-sent" &&
        (sendExportAts.has(e.createdAt) || sends.some((at) => Math.abs(at - e.createdAt) <= SAME_SEND_MS))
      )
        continue;
      const by = typeof e.meta?.reviewedBy === "string" ? e.meta.reviewedBy : "";
      out.push({
        ...e,
        title: FORMAT_WORDS[format] ?? "Downloaded the letter",
        detail: by ? `Counsel review by ${by}` : format === "marked-sent" ? undefined : e.detail,
      });
      continue;
    }
    if (e.kind === "counsel_review") {
      // Already said on its download row.
      const exportId = e.meta?.exportId;
      if (exportId && exportIds.has(String(exportId))) continue;
      const by = String(e.meta?.reviewedBy ?? "");
      const on = typeof e.meta?.reviewedOn === "string" ? e.meta.reviewedOn : "";
      const key = `${by}|${on}`;
      if (seenAttestations.has(key)) continue;
      seenAttestations.add(key);
      out.push({
        ...e,
        title: by ? `Counsel review by ${by}` : "Counsel review recorded",
        detail: on ? `Reviewed on ${dayInWords(on)}` : undefined,
      });
      continue;
    }
    if (e.kind === "review_submitted") {
      // The store records the approver as this entry's actor; they are who
      // it went to, not who sent it (SEND-X38).
      out.push({ ...e, title: sentForApprovalTitle(e.actorName), actorName: undefined });
      continue;
    }
    if (e.kind === "ai_message") {
      out.push({ ...e, title: e.meta?.role === "user" ? "Asked DraftHR" : "DraftHR replied" });
      continue;
    }
    if (e.kind === "ai_applied" && /^Applied AI rewrite to /.test(e.title)) {
      out.push({ ...e, title: e.title.replace(/^Applied AI rewrite to /, "DraftHR rewrote ") });
      continue;
    }
    out.push(e);
  }
  return out;
}

function dayInWords(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return formatDateOnly(iso, { day: "numeric", month: "long", year: "numeric" }, "en-GB");
}

/** How many files were downloaded: the exports, less "Marked as sent",
 *  which records a send and downloads nothing (LETTER-X49). */
export function downloads(events: DraftTimelineItem[]): number {
  return events.filter((e) => e.category === "exports" && e.meta?.format !== "marked-sent").length;
}
