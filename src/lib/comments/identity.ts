import type { Collaborator, Comment, Draft } from "@/lib/letters/types";
import type { Profile } from "@/lib/profile";

/**
 * Local identity helpers for commenting. The active "user" is derived from
 * the profile; collaborator identities are only used to render old comments
 * and participant lists.
 */

export type CommentIdentity = {
  id: string;
  name: string;
  email?: string;
  initials: string;
  /** Stable hash-based color index 0..7 for avatar tint. */
  hue: number;
};

const PALETTE = [
  "var(--gold-9)",
  "var(--blue-9)",
  "var(--green-9)",
  "var(--purple-9)",
  "var(--red-9)",
  "var(--cyan-9)",
  "var(--amber-9)",
  "var(--pink-9)",
];

export function colorFor(hue: number): string {
  return PALETTE[hue % PALETTE.length];
}

export function initialsOf(name: string | undefined, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

export function meIdentity(profile: Profile): CommentIdentity {
  const name = profile.personal.legalName?.trim() || "You";
  const email = profile.personal.email;
  return {
    id: "me",
    name,
    email,
    initials: initialsOf(name, email),
    hue: hashHue(email ?? name),
  };
}

export function collaboratorIdentity(c: Collaborator): CommentIdentity {
  return {
    id: c.id,
    name: c.name ?? c.email,
    email: c.email,
    initials: initialsOf(c.name, c.email),
    hue: hashHue(c.email),
  };
}

export function listIdentities(draft: Draft, profile: Profile): CommentIdentity[] {
  return [meIdentity(profile), ...(draft.collaborators ?? []).map(collaboratorIdentity)];
}

/** Who is looking at the comments: the signed-in user id (null when auth is
 *  off, i.e. a local-only demo) and their workspace role. */
export type CommentViewer = { userId: string | null; role?: string | null };

/** True when the comment was written by someone other than the viewer. A
 *  comment synced from a teammate keeps the local "me" authorId, so the
 *  workspace user id is what tells them apart. */
export function isOthersComment(comment: Comment, viewer: CommentViewer): boolean {
  return Boolean(comment.authorUserId && viewer.userId && comment.authorUserId !== viewer.userId);
}

/** The identity to render for a comment: the matching local identity, except
 *  that a teammate's comment never resolves to "me". */
export function identityForComment(
  comment: Comment,
  identities: CommentIdentity[],
  viewer: CommentViewer,
): CommentIdentity {
  const match = isOthersComment(comment, viewer)
    ? undefined
    : identities.find((i) => i.id === comment.authorId);
  if (match) return match;
  const seed = comment.authorEmail ?? comment.authorUserId ?? comment.authorName;
  return {
    id: comment.authorUserId ?? comment.authorId,
    name: comment.authorName || comment.authorEmail || "Someone",
    email: comment.authorEmail,
    initials: initialsOf(comment.authorName, comment.authorEmail),
    hue: hashHue(seed ?? "?"),
  };
}

/** Mirrors the server rule: only the author, or an owner/admin, may delete. */
export function canDeleteComment(comment: Comment, viewer: CommentViewer): boolean {
  if (viewer.role === "owner" || viewer.role === "admin") return true;
  return !isOthersComment(comment, viewer);
}
