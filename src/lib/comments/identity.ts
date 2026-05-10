import type { Collaborator, Draft } from "@/lib/letters/types";
import type { Profile } from "@/lib/profile";

/**
 * Local identity helpers for commenting. With no real auth, the active
 * "user" is derived from the profile; collaborators show as their stored
 * name + email when impersonated via the comment composer's identity picker.
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
