import { beforeEach, describe, expect, it } from "vitest";
import { deriveNotifications } from "./notifications";
import { useDraftStore } from "./store";
import { useProfileStore } from "./profile";

beforeEach(() => useDraftStore.setState({ drafts: {}, matters: {}, employees: {} }));
function notifications(deadline: string, jurisdiction = "UK") {
  const id = useDraftStore.getState().createDraft("reference", { jurisdiction }, "employer");
  const draft = useDraftStore.getState().drafts[id];
  draft.context.protectedDeadline = { iso: deadline, basis: "Recorded by user" };
  return deriveNotifications([draft], useProfileStore.getState().profile, new Date(2026, 9, 3, 12).getTime());
}
describe("legal deadline reminders", () => {
  it("does not invent an Acas deadline 42 days before a recorded claim date", () => {
    const reminders = notifications("2026-11-21"); // former fabricated deadline: 10 October
    expect(reminders.some(n => n.kind === "acas_ec_deadline")).toBe(false);
  });
  it("labels recorded dates as reminders, not definitive legal time limits", () => {
    const reminders = notifications("2026-10-10");
    expect(reminders.find(n => n.kind === "tribunal_deadline")).toMatchObject({ title: "Recorded deadline in 7 days" });
    expect(reminders.find(n => n.kind === "tribunal_deadline")?.description).toContain("does not establish a legal time limit");
    const acas = reminders.find(n => n.kind === "acas_ec_deadline");
    expect(acas?.title).toBe("Check Acas notification requirements");
    expect(acas?.description).not.toMatch(/6 weeks|lodge ACAS EC by/);
    expect(acas?.description).toContain("Notification and certificate dates");
  });
  it("never adds UK conciliation instructions to a US draft", () => {
    expect(notifications("2026-10-10", "US").some(n => n.kind === "acas_ec_deadline")).toBe(false);
  });
  it("does not surface impossible or timestamp-like legacy reminder dates", () => {
    for (const iso of ["2026-10-10T00:00:00Z", "2026-02-30", "2026-10-10junk"]) {
      expect(notifications(iso).some(n => n.kind === "tribunal_deadline" || n.kind === "acas_ec_deadline")).toBe(false);
    }
  });
  it("does not repeat a legacy statutory basis as legal advice", () => {
    const id = useDraftStore.getState().createDraft("acas_ec_notification", { jurisdiction: "UK" }, "employee");
    const draft = useDraftStore.getState().drafts[id];
    draft.context.protectedDeadline = { iso: "2026-10-10", basis: "3 months less one day; automatic extension" };
    const result = deriveNotifications([draft], useProfileStore.getState().profile, new Date(2026, 9, 3, 12).getTime());
    expect(result.find(n => n.kind === "tribunal_deadline")?.description).toContain("Unverified reminder only");
    expect(result.find(n => n.kind === "tribunal_deadline")?.description).not.toContain(draft.context.protectedDeadline.basis);
  });
});
