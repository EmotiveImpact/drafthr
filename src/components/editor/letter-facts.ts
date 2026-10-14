import type { Draft, Employee } from "@/lib/letters/types";
import type { Profile } from "@/lib/profile";
import { canApprove } from "@/lib/permissions";
import { currentRound, firstName, type ReviewRequest } from "@/lib/journey/reviews";
import { summariseRound } from "@/components/journey/review/model";
import type { ActivityEvent } from "@/components/journey/ui";
import { appealWorkingDays, downloadedActivity, fmtShortDay, type SentRecord } from "@/components/journey/send/record";
import { toDateOnly } from "@/lib/date-only";
import { approvalWord, isOwnLetter } from "@/lib/journey/stage";

/**
 * Facts about a letter that the workspace shows around the page (chips,
 * notice strips, the Activity card, the avatars), each read from the draft's
 * real fields. Nothing here invents data: when a fact is missing the caller
 * hides the thing that would show it.
 */

/** The appeal window the letter states ("within five working days"), or
 *  null when it gives no right of appeal. One rule for the whole letter
 *  workspace: the send record's (src/components/journey/send/record.ts). */
export { appealWorkingDays };

/** Add working days (Monday to Friday) to a timestamp. */
export function addWorkingDays(ms: number, days: number): Date {
  const d = new Date(ms);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d;
}

/** The employee record behind the letter: the linked one, else a name match. */
export function employeeFor(draft: Draft, employees: Record<string, Employee>): Employee | undefined {
  const linked = (draft.answers as Record<string, unknown>)?.linkedEmployeeId as string | undefined;
  if (linked && employees[linked]) return employees[linked];
  const name = draft.employee?.legalName?.trim().toLowerCase();
  if (!name) return undefined;
  return Object.values(employees).find((e) => e.legalName?.trim().toLowerCase() === name);
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "Thu 15 Oct" */
export function fmtDay(ms: number | Date): string {
  return new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "14 Oct, 15:42", or "15:42" when it is today. */
export function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? fmtTime(ms) : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${fmtTime(ms)}`;
}

/** "14 October 2026" */
export function fmtLong(ms: number | Date): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** How the letter was given, in words ("handed over in person"). */
export function deliveryPhrase(method: Draft["context"]["deliveryMethod"] | undefined): string {
  switch (method) {
    case "hand-delivery":
      return "handed over in person";
    case "post":
      return "sent by post";
    case "recorded-delivery":
      return "sent by recorded delivery";
    case "email":
      return "sent by email";
    default:
      return "given to the employee";
  }
}

/** My display name. */
export function myName(profile: Profile): string {
  return profile.personal.preferredName?.trim() || profile.personal.legalName?.trim() || "";
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  return !!x && x === y;
}

/**
 * The person looking is the letter's approver: they can approve (owner,
 * admin or reviewer role) and they are the named approver, or they hold the
 * reviewer role (a workspace reviewer approves what is sent to them).
 */
export function viewerIsApproverFor(draft: Draft, profile: Profile, approverName: string | undefined): boolean {
  const role = profile.workspaceRole;
  if (!canApprove(role)) return false;
  if ((draft.reviewStatus ?? "draft") !== "in_review") return false;
  if (role === "reviewer") return true;
  return sameName(approverName, profile.personal.legalName) || sameName(approverName, profile.personal.preferredName);
}

export type LetterPerson = { name: string; seed: string; title: string; approved?: boolean; kind: "you" | "collaborator" | "reviewer" | "approver" };

/** The real people on the letter: you, invited collaborators, the reviewer, the approver. */
export function peopleOnLetter(draft: Draft, profile: Profile, review: ReviewRequest | null): LetterPerson[] {
  const out: LetterPerson[] = [];
  const seen = new Set<string>();
  const add = (p: LetterPerson) => {
    const key = p.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  const me = myName(profile) || "You";
  add({ name: me, seed: profile.personal.email || me, title: `${me} (you)`, kind: "you" });
  for (const c of draft.collaborators ?? []) {
    const name = c.name?.trim() || c.email;
    add({ name, seed: c.email, title: `${name}, ${c.role}${c.status === "pending" ? " (invited)" : ""}`, kind: "collaborator" });
  }
  if (review && review.status !== "recalled") {
    add({
      name: review.reviewer.name,
      seed: review.reviewer.email || review.reviewer.name,
      title: `${review.reviewer.name}, reviewer`,
      kind: "reviewer",
    });
  }
  const approvals = draft.approvals ?? [];
  const submitted = [...approvals].reverse().find((a) => a.decision === "submitted");
  const approved = [...approvals].reverse().find((a) => a.decision === "approved");
  const approverName = approved?.reviewerName || submitted?.reviewerName;
  if (approverName && !/^workspace reviewer$/i.test(approverName)) {
    const isApproved = (draft.reviewStatus === "approved" || !!draft.exports?.some((e) => e.format === "marked-sent")) && !!approved;
    const existing = out.find((p) => p.name.trim().toLowerCase() === approverName.trim().toLowerCase());
    if (existing) {
      existing.approved = isApproved;
      existing.title = `${existing.name}, approver`;
    } else {
      add({ name: approverName, seed: approverName, title: `${approverName}, approver`, approved: isApproved, kind: "approver" });
    }
  }
  return out;
}

const FORMAT_WORDS: Record<string, string> = {
  pdf: "Downloaded the PDF",
  docx: "Downloaded the Word file",
  txt: "Downloaded the plain text",
  pack: "Downloaded the evidence pack",
  audit: "Downloaded the audit record",
};

/** Downloads made within this long of each other read as one line. */
const DOWNLOAD_GROUP_MS = 5000;

/**
 * The Activity card (from Approval on): the letter's audit record, newest
 * first. Built from the draft's timeline and the review request's rounds.
 */
export function activityEvents(draft: Draft, review: ReviewRequest | null, me: string): ActivityEvent[] {
  type E = ActivityEvent & { at: number };
  const out: E[] = [];
  const who = (name: string | undefined) => (!name || sameName(name, me) ? "You" : name);
  const timeline = draft.timeline ?? [];
  // The Send step records the send itself ("Given in person by ..."), timed
  // like its marked-sent export: show that line and not both.
  // The send line is listed when it was recorded; its marked-sent export
  // carries the date given (meta.sentExportAt names it).
  // Its export's own entry is listed when the send was recorded too (SEND-X35).
  const sentAts = new Set(
    timeline
      .filter((t) => t.kind === "details_updated" && t.meta?.action === "sent")
      .flatMap((t) => (typeof t.meta?.sentExportAt === "number" ? [t.meta.sentExportAt, t.createdAt] : [t.createdAt]))
  );
  // Downloads made together (the Send step's "Download and mark as sent")
  // read as one line: "Downloaded PDF and evidence pack".
  let lastDownload: { e: E; keys: SentRecord["downloaded"] } | null = null;
  for (const t of timeline) {
    const at = t.createdAt;
    if (t.kind === "review_submitted") {
      const approver = t.actorName && !/^workspace reviewer$/i.test(t.actorName) ? firstName(t.actorName) : "the approver";
      out.push({ id: t.id, at, title: `Sent to ${approver} to approve`, meta: `You · ${fmtWhen(at)}` });
    } else if (t.kind === "review_approved") {
      // An employee's own letter has no approver: they signed it off (FOUNDATION-X5).
      const signer = isOwnLetter(draft) ? who(t.actorName) : t.actorName || "Approver";
      out.push({ id: t.id, at, title: approvalWord(draft), meta: `${signer} · ${fmtWhen(at)}`, done: true });
    } else if (t.kind === "review_changes_requested") {
      out.push({ id: t.id, at, title: "Changes requested", meta: `${t.actorName || "Approver"} · ${fmtWhen(at)}` });
    } else if (t.kind === "review_withdrawn") {
      out.push({ id: t.id, at, title: "Withdrawn from approval", meta: `You · ${fmtWhen(at)}` });
    } else if (t.kind === "exported") {
      const format = String(t.meta?.format ?? "");
      if (format === "marked-sent") {
        if (sentAts.has(at)) continue;
        // Older sends have no send record: the export event alone. Its
        // reviewedBy is the counsel attestation, not who sent it.
        out.push({
          id: t.id,
          at,
          title: `Marked as sent, ${deliveryPhrase(draft.context.deliveryMethod)}`,
          meta: `${who(undefined)} · ${fmtWhen(at)}`,
          done: true,
        });
      } else if (FORMAT_WORDS[format]) {
        const key = format as SentRecord["downloaded"][number];
        if (lastDownload && Math.abs(at - lastDownload.e.at) <= DOWNLOAD_GROUP_MS && !lastDownload.keys.includes(key)) {
          lastDownload.keys.push(key);
          lastDownload.e.title = downloadedActivity(lastDownload.keys) ?? lastDownload.e.title;
          lastDownload.e.at = Math.max(lastDownload.e.at, at);
          lastDownload.e.meta = `You · ${fmtWhen(lastDownload.e.at)}`;
          continue;
        }
        const e: E = { id: t.id, at, title: FORMAT_WORDS[format], meta: `You · ${fmtWhen(at)}` };
        out.push(e);
        lastDownload = { e, keys: [key] };
      }
    } else if (t.kind === "details_updated" && t.meta?.action === "sent") {
      // A back-dated send says the day it was given ("Handed over in person on 6 Oct").
      const given = typeof t.meta?.dateGiven === "string" ? t.meta.dateGiven : null;
      const title = given && toDateOnly(new Date(at)) !== given ? `${t.title} on ${fmtShortDay(given)}` : t.title;
      out.push({ id: t.id, at, title, meta: `${who(t.actorName)} · ${fmtWhen(at)}`, done: true });
    } else if (t.kind === "details_updated" && t.meta?.action === "unmarked-sent") {
      out.push({ id: t.id, at, title: t.title, meta: `${who(t.actorName)} · ${fmtWhen(at)}` });
    } else if (t.kind === "counsel_review") {
      out.push({ id: t.id, at, title: t.title, meta: fmtWhen(at) });
    } else if (t.kind === "created") {
      out.push({ id: t.id, at, title: t.title.replace(/^Created /, "Started "), meta: `${who(t.actorName)} · ${fmtWhen(at)}` });
    }
  }
  if (review && review.status !== "recalled") {
    const rname = firstName(review.reviewer.name) || "Reviewer";
    for (const r of review.rounds) {
      if (r.backAt) {
        // Count suggestions and comments as the rounds history does, not
        // the marks a suggestion leaves in the text.
        const sum = summariseRound(draft, review, r);
        const changes = sum.changes;
        const comments = sum.comments;
        const parts: string[] = [];
        if (changes) parts.push(`${changes} change${changes === 1 ? "" : "s"}`);
        if (comments) parts.push(`${comments} comment${comments === 1 ? "" : "s"}`);
        const verdict = r.verdict ? verdictWords(r.verdict) : "";
        out.push({
          id: `${review.id}-r${r.n}-back`,
          at: r.backAt,
          title: `${rname}: ${parts.length ? parts.join(", ") : verdict || "sent it back"}`,
          meta: `Round ${r.n} · ${fmtWhen(r.backAt)}`,
        });
      }
    }
    if (review.status === "finished" && review.finishedAt) {
      const n = review.rounds.length;
      // First in the list, so within the same millisecond it sorts below
      // what finishing led to ("Sent to Ruth to approve" comes after it).
      out.unshift({
        id: `${review.id}-finished`,
        at: review.finishedAt,
        title: `Review finished, ${n} round${n === 1 ? "" : "s"}`,
        // Whoever finished it: the person who asked, never the reviewer
        // (LETTER-X51). "You" when that is the person looking.
        meta: `${who(review.finishedBy?.name ?? review.asker?.name)} · ${fmtWhen(review.finishedAt)}`,
        done: true,
      });
    }
  }
  // Newest first; events recorded in the same millisecond keep their
  // recorded order, newest first too.
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.at - a.e.at || b.i - a.i)
    .map(({ e: { at: _at, ...e } }) => e);
}

/** A verdict in words, lower case ("ready once my changes are in"). */
export function verdictWords(v: NonNullable<ReturnType<typeof currentRound>>["verdict"]): string {
  if (v === "ready") return "ready to send as it is";
  if (v === "ready-with-changes") return "ready once the changes are in";
  if (v === "rethink") return "needs a rethink";
  return "";
}

/** The approval entry that approved the letter, if any. */
export function approvedEntry(draft: Draft) {
  return [...(draft.approvals ?? [])].reverse().find((a) => a.decision === "approved");
}

/** The approval entry that sent it for approval, if any. */
export function submittedEntry(draft: Draft) {
  return [...(draft.approvals ?? [])].reverse().find((a) => a.decision === "submitted");
}

/** Where the approver's workspace user id is remembered (set when it is sent for approval). */
export const APPROVER_USER_KEY = (draftId: string) => `drafthr.approverUserId:${draftId}`;

/** The approver's workspace role, remembered with their user id (Approve shows "Admin · approver"). */
export const APPROVER_ROLE_KEY = (draftId: string) => `drafthr.approverRole:${draftId}`;

/**
 * The approver's job title, for "Operations Director · approver" on the
 * Approve card: their employee record when they have one, else the title
 * the workspace's own letters give them beside their name ("Ruth Adeyemi,
 * Operations Director" or a sign-off "Ruth Adeyemi<br>Operations
 * Director"). Null when nothing names it.
 */
export function approverTitleFor(
  name: string | undefined,
  drafts: Record<string, Draft>,
  employees: Record<string, Employee>
): string | null {
  const who = (name ?? "").trim();
  if (!who || /^workspace reviewer$/i.test(who)) return null;
  const lower = who.toLowerCase();
  const emp = Object.values(employees).find((e) => e.legalName?.trim().toLowerCase() === lower && e.jobTitle?.trim());
  if (emp?.jobTitle) return emp.jobTitle.trim();
  const esc = who.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A capitalised title of one to five words straight after the name.
  const word = "[A-Z][A-Za-z'&-]*";
  const re = new RegExp(`${esc}(?:,[ \\t]*|[ \\t]*\\n[ \\t]*)(${word}(?:[ \\t]+(?:of|and|&|${word})){0,4})(?=[,.;:)\\n]|$)`);
  const counts = new Map<string, number>();
  for (const d of Object.values(drafts)) {
    for (const s of d.sections ?? []) {
      if (!s.html || !s.html.includes(who)) continue;
      const text = s.html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ");
      const m = text.match(re);
      if (m?.[1]) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let n = 0;
  for (const [t, c] of counts) if (c > n) [best, n] = [t, c];
  return best;
}
