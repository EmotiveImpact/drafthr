import { z } from "zod";
import { isSafeImageRef } from "./safe-data-url.js";
export type WorkspacePreferences = z.infer<typeof workspacePreferencesSchema>;
const short = z.string().max(500).optional();
const address = z.string().max(20_000).optional();
const image = z.string().max(2_000_000).refine(value => value === "" || isSafeImageRef(value), "Invalid image reference").optional();
export const employerPreferencesSchema = z.object({ legalName: short, address, registrationNumber: short,
  signatoryName: short, signatoryTitle: short, recipientName: short, recipientTitle: short,
  letterheadDataUrl: image, signatureDataUrl: image }).strict();
export const workspacePreferencesSchema = z.object({
  id: z.string().uuid(), setupComplete: z.boolean(), role: z.enum(["employer", "employee"]).nullable(),
  personal: z.object({ legalName: short, preferredName: short, address, email: short, phone: short, jobTitle: short, department: short, startDate: short }).strict(),
  employer: employerPreferencesSchema,
  defaults: z.object({ jurisdiction: z.enum(["UK", "US"]), ukRegion: z.enum(["England & Wales", "Scotland", "Northern Ireland"]).optional(),
    usState: z.enum(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"]).optional(),
    workerClass: z.enum(["employee", "worker", "contractor", "casual"]), tone: z.enum(["warm", "neutral", "formal", "firm"]).optional(),
    employeeTone: z.enum(["conciliatory", "assertive", "forensic", "tribunal_ready"]).optional(),
    qwenModel: z.enum(["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"]).optional() }).strict(),
  autoFill: z.boolean(),
}).strict();
export function defaultWorkspacePreferences(id: string): WorkspacePreferences {
  return { id, setupComplete: false, role: null, personal: {}, employer: {}, defaults: { jurisdiction: "UK", workerClass: "employee", qwenModel: "claude-sonnet-4-6" }, autoFill: true };
}
export function preferencesFromProfile(id: string, profile: Omit<WorkspacePreferences, "id"> & { credits: number; workspaceRole: string }): WorkspacePreferences {
  const { credits: _credits, workspaceRole: _workspaceRole, ...preferences } = profile;
  return { ...preferences, id };
}
