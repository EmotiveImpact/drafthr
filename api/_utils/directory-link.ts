/**
 * Sign-in hook: link Directory Sync placeholder rows to the person who just
 * authenticated (see linkDirectoryPlaceholders in directory-provisioning.ts).
 *
 * Called by every handler that mints a session, before the cookie is set, so
 * the user's first API request already resolves to their linked row. Best
 * effort: a failure is logged and sign-in carries on (the link is retried on
 * the next sign-in, and offboarding also matches by email within the tenant).
 */
import { dbEnabled } from "../../src/db/index.js";
import { createDrizzleDirectoryStore } from "./directory-store.js";
import { linkDirectoryPlaceholders, type SignInIdentity } from "./directory-provisioning.js";

export async function linkDirectoryIdentityOnSignIn(identity: SignInIdentity): Promise<void> {
  if (!dbEnabled()) return;
  if (!identity.emailVerified || !identity.email) return;
  try {
    await linkDirectoryPlaceholders(createDrizzleDirectoryStore(), identity);
  } catch (err) {
    console.error("[directory-link] linking failed; continuing sign-in", err);
  }
}
