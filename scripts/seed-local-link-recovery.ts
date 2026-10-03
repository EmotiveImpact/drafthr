/** Local-only fixtures for a concurrent deletion while browser tabs retain
 * older revisions. Never resets an existing fixture or touches the source. */
import { and, eq, sql } from "drizzle-orm";
import { databaseUrl, getDb, closeDb } from "../src/db/index.js";
import { users, drafts, matters } from "../src/db/schema.js";
import { toServerUuid } from "../src/lib/remote-ids.js";
import type { Draft } from "../src/lib/letters/types.js";

if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR !== "1") throw new Error("Local emulator guard required");
databaseUrl();
const mode = process.argv[2];
if (mode !== "prepare" && mode !== "advance") throw new Error("Use prepare or advance");
// A new run creates separate fixtures; never reset an earlier acceptance run.
const run = process.argv[3] ?? "v1";
if (!/^[a-z0-9-]{1,32}$/.test(run)) throw new Error("Use a short lowercase fixture run label");
const parentId = toServerUuid(`local-link-recovery-parent-${run}`);
const liveId = toServerUuid(`local-link-recovery-live-${run}`), deletedId = toServerUuid(`local-link-recovery-deleted-${run}`);
const db = getDb();
try {
  const [user] = await db.select().from(users).where(eq(users.externalId, "user_local_drafthr_demo"));
  if (!user) throw new Error("Fictional demo user required");
  const [source] = await db.select().from(drafts).where(and(eq(drafts.id, "ed6a90e1-2bb2-458a-b418-393c7889d78a"), eq(drafts.authorUserId, user.id)));
  if (!source?.snapshotJson || source.deletedAt || !source.title?.startsWith("Fictional storage verification")) throw new Error("Fictional source required");
  const tenantId = source.tenantId;
  await db.transaction(async tx => {
    if (mode === "prepare") {
      const now = Date.now();
      const parent = { id: parentId, name: "Fictional link recovery parent", mode: "employer", status: "active", color: "slate", createdAt: now, updatedAt: now };
      await tx.insert(matters).values({ id: parentId, tenantId, name: parent.name, mode: "employer", type: "general", snapshotJson: parent, revision: 1 }).onConflictDoNothing();
      for (const [id, label] of [[liveId, "live letter"], [deletedId, "deleted letter"]]) {
        const snapshot = structuredClone(source.snapshotJson) as unknown as Draft;
        Object.assign(snapshot, { id, title: `Fictional link recovery — ${label}`, matterId: parentId, evidence: [], approvals: [], exports: [], timeline: [], collaborators: [], reviewStatus: "draft", createdAt: now, updatedAt: now });
        delete snapshot.employeeId; delete snapshot.templateSourceId; snapshot.isTemplateSource = false;
        delete snapshot.submittedForReviewAt; delete snapshot.reviewDecidedAt;
        snapshot.sections = snapshot.sections.map(section => ({ ...section, html: "<p>Fictional recovery fixture. Not an employment document. Do not send.</p>", versions: [] }));
        await tx.insert(drafts).values({ id, tenantId, authorUserId: user.id, matterId: parentId, title: snapshot.title,
          mode: snapshot.mode, letterType: snapshot.letterType, contextJson: snapshot.context, employerJson: snapshot.employer,
          employeeJson: snapshot.employee, answersJson: snapshot.answers, snapshotJson: snapshot as unknown as Record<string, unknown>, revision: 1 }).onConflictDoNothing();
      }
    } else {
      const [parent] = await tx.select().from(matters).where(and(eq(matters.id, parentId), eq(matters.tenantId, tenantId)));
      const rows = await tx.select().from(drafts).where(and(eq(drafts.tenantId, tenantId), sql`${drafts.id} in (${liveId}, ${deletedId})`));
      if (parent?.name !== "Fictional link recovery parent" || rows.length !== 2 || rows.some(row => !row.title?.startsWith("Fictional link recovery —"))) throw new Error("Exact fictional fixtures required");
      if (parent.deletedAt) { console.log("Already advanced; nothing changed."); return; }
      // Tiptap may normalize paragraph alignment once on first render. Permit
      // only that exact fictional content, never arbitrary intervening edits.
      const pristine = (row: typeof rows[number]) => {
        const snapshot = row.snapshotJson as unknown as Draft;
        return [1, 2].includes(row.revision) && !row.deletedAt && row.matterId === parentId &&
          row.title === `Fictional link recovery — ${row.id === liveId ? "live letter" : "deleted letter"}` &&
          !snapshot.evidence?.length && !snapshot.timeline?.length && !snapshot.approvals?.length &&
          snapshot.sections.every(section => ["<p>Fictional recovery fixture. Not an employment document. Do not send.</p>",
            '<p style="text-align: left;">Fictional recovery fixture. Not an employment document. Do not send.</p>'].includes(section.html) && !section.versions?.length);
      };
      if (parent.revision !== 1 || rows.some(row => !pristine(row))) throw new Error("Fixture already edited; refusing to overwrite it");
      const now = new Date();
      await tx.update(matters).set({ deletedAt: now, revision: 2, updatedAt: now }).where(eq(matters.id, parentId));
      for (const row of rows) await tx.update(drafts).set({ matterId: null, snapshotJson: sql`${drafts.snapshotJson} - 'matterId'`,
        deletedAt: row.id === deletedId ? now : null, revision: row.revision + 1, updatedAt: now }).where(eq(drafts.id, row.id));
    }
  });
  console.log(JSON.stringify({ live: `http://localhost:5273/editor/${liveId}`, deleted: `http://localhost:5273/editor/${deletedId}`, mode, run }));
} finally { await closeDb(); }
