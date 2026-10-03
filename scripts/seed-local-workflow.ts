/** Fictional, idempotent demo fixture. Never runs against a hosted database. */
import { and, eq } from "drizzle-orm";
import { getDb, closeDb, databaseUrl } from "../src/db/index.js";
import { users, tenantMembers, employees, matters, matterParticipants, drafts } from "../src/db/schema.js";
import { REFERENCE_UK } from "../src/lib/letters/templates/employer/reference.js";
import type { Draft } from "../src/lib/letters/types.js";

if (process.env.DRAFTHR_LOCAL_WORKOS_EMULATOR !== "1") throw new Error("Local emulator guard required");
databaseUrl(); // Loopback host + dedicated port required.
const db = getDb();
try {
  const [user] = await db.select().from(users).where(eq(users.externalId, "user_local_drafthr_demo"));
  if (!user) throw new Error("Sign in with the fictional demo account first");
  const [member] = await db.select().from(tenantMembers).where(and(eq(tenantMembers.userId, user.id), eq(tenantMembers.isActiveTenant, true)));
  if (!member) throw new Error("Create the fictional local workspace first");
  const tenantId = member.tenantId;
  const employeeId = "e8f1a1fa-4e24-4f25-87e6-e9a05c7287fa";
  const matterId = "fd634c2e-0108-412b-a6ce-e71d4f3702d7";
  const draftId = "ed6a90e1-2bb2-458a-b418-393c7889d78a";
  const now = Date.now();
  const employee = { id: employeeId, legalName: "Fictional Workflow Employee", status: "active", createdAt: now, updatedAt: now };
  const matter = { id: matterId, name: "Fictional storage verification", mode: "employer", status: "active", color: "slate",
    participants: [{ employeeId, name: employee.legalName, role: "subject" }], createdAt: now, updatedAt: now };
  const draft: Draft = {
    id: draftId, title: "Fictional storage verification — not an employment reference", employeeId, matterId,
    mode: "employer", letterType: "reference",
    context: { mode: "employer", letterType: "reference", jurisdiction: "UK", ukRegion: "England & Wales", workerClass: "employee",
      effectiveDate: "2026-09-27", issueDate: "2026-09-27", deliveryMethod: "email", tone: "neutral", confidentiality: "confidential",
      counselReviewRequired: false, riskFlags: { protectedStatus: false, grievanceLast90Days: false, collectiveConsultation: false } },
    employer: { legalName: "Fictional Demo Company", address: "Local test only", hasLetterhead: false, signatoryName: "Fictional Manager", signatoryTitle: "Demo reviewer" },
    employee: { legalName: employee.legalName, jobTitle: "Test role", address: "", startDate: "2025-01-01", serviceMonths: 20 },
    answers: {}, evidence: [], sections: REFERENCE_UK.sections.map(section => ({
      id: crypto.randomUUID(), sectionId: section.sectionId, title: section.title, required: true, status: "edited",
      html: `<p>Fictional local storage test: ${section.title}. This is not an employment reference and must not be sent.</p>`, versions: [],
    })), createdAt: now, updatedAt: now,
  };
  await db.transaction(async tx => {
    await tx.insert(employees).values({ id: employeeId, tenantId, legalName: employee.legalName, status: "active", snapshotJson: employee, revision: 1 }).onConflictDoNothing();
    await tx.insert(matters).values({ id: matterId, tenantId, name: matter.name, mode: "employer", type: "general", snapshotJson: matter, revision: 1 }).onConflictDoNothing();
    const [existing] = await tx.select({ id: drafts.id }).from(drafts).where(eq(drafts.id, draftId));
    if (!existing) {
      await tx.insert(matterParticipants).values({ matterId, employeeId, name: employee.legalName, role: "subject" });
      await tx.insert(drafts).values({ id: draftId, tenantId, authorUserId: user.id, matterId, employeeId,
        mode: draft.mode, letterType: draft.letterType, title: draft.title, contextJson: draft.context,
        employerJson: draft.employer, employeeJson: draft.employee, answersJson: {}, snapshotJson: draft as unknown as Record<string, unknown>, revision: 1 });
    }
  });
  console.log(`Fictional fixture ready: http://localhost:5273/editor/${draftId}/finalize`);
} finally { await closeDb(); }
