import { z } from "zod";
import type { CustomTemplate, Employee, Matter, MatterEvent, Task } from "./letters/types.js";

export const WORKSPACE_RECORD_KINDS = ["employees", "matters", "tasks", "events", "templates"] as const;
export type WorkspaceRecordKind = typeof WORKSPACE_RECORD_KINDS[number];
export type WorkspaceRecordMap = {
  employees: Employee; matters: Matter; tasks: Task; events: MatterEvent; templates: CustomTemplate;
};
export type WorkspaceRecord = WorkspaceRecordMap[WorkspaceRecordKind];
export type WorkspaceDocument = {
  id: string; revision: number; snapshot: WorkspaceRecord | null;
  deletedAt: number | null; updatedAt: number;
};

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const timestamp = z.number().int().min(0).max(8_640_000_000_000_000);
const shortText = z.string().max(500);
const longText = z.string().max(20_000);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date");
const mode = z.enum(["employer", "employee"]);
const common = { id, createdAt: timestamp, updatedAt: timestamp };

const employee = z.object({
  ...common, legalName: shortText.trim().min(1), address: longText.optional(),
  preferredName: shortText.optional(), jobTitle: shortText.optional(), department: shortText.optional(),
  managerName: shortText.optional(), managerEmail: shortText.optional(), email: shortText.optional(),
  startDate: dateOnly.or(z.literal("")).optional(), endDate: dateOnly.or(z.literal("")).optional(),
  workerClass: z.enum(["employee", "worker", "contractor", "casual"]).optional(),
  status: z.enum(["active", "notice", "left", "on-leave"]), notes: longText.optional(),
}).strict();
const matter = z.object({
  ...common, name: shortText.trim().min(1), mode,
  status: z.enum(["active", "closed", "archived"]), color: z.enum(["red", "amber", "blue", "violet", "green", "slate"]),
  description: longText.optional(),
  parties: z.object({ primaryName: shortText.optional(), primaryContext: shortText.optional() }).strict().optional(),
  deadlineISO: dateOnly.or(z.literal("")).optional(), deadlineLabel: shortText.optional(), counselReviewed: z.boolean().optional(),
  type: z.enum(["investigation", "grievance", "disciplinary", "performance", "absence", "redundancy", "restructure", "settlement", "tribunal", "onboarding", "offboarding", "other"]).optional(),
  riskBand: z.enum(["low", "moderate", "high", "critical"]).optional(),
  participants: z.array(z.object({ employeeId: id.nullable(), name: shortText, role: z.enum(["subject", "manager", "accused", "complainant", "witness", "representative", "other"]) }).strict()).max(500).optional(),
  ownerUserId: shortText.optional(), nextAction: shortText.optional(),
  exposureGBP: z.number().finite().min(0).max(2_147_483_647).optional(), archivedAt: timestamp.optional(),
}).strict();
const task = z.object({
  ...common, matterId: id, label: shortText.trim().min(1), dueISO: dateOnly.or(z.literal("")).optional(),
  status: z.enum(["open", "done", "skipped"]), assignee: shortText.optional(), doneAt: timestamp.optional(),
}).strict();
const event = z.object({
  id, createdAt: timestamp, matterId: id, kind: z.enum(["meeting", "hearing", "deadline", "review"]),
  label: shortText.trim().min(1),
  whenISO: z.string().max(40).refine((value) => {
    if (value.length === 10) return dateOnly.safeParse(value).success;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && dateOnly.safeParse(value.slice(0, 10)).success && Number.isFinite(Date.parse(value));
  }, "Invalid event date"), detail: longText.optional(),
}).strict();
const template = z.object({
  ...common, name: shortText.trim().min(1), description: longText.optional(), baseLetterType: id, mode,
  jurisdiction: z.enum(["UK", "US"]).optional(), sectionHtml: z.record(z.string().max(200_000)),
  answers: z.record(z.unknown()).optional(), emoji: z.string().max(100).optional(),
}).strict();

export const workspaceRecordSchemas = { employees: employee, matters: matter, tasks: task, events: event, templates: template };
export function isWorkspaceRecordKind(value: unknown): value is WorkspaceRecordKind {
  return typeof value === "string" && (WORKSPACE_RECORD_KINDS as readonly string[]).includes(value);
}
