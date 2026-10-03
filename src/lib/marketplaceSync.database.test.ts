import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getConsultantProfile: vi.fn(), saveConsultantProfile: vi.fn(), createBooking: vi.fn(),
  getInbox: vi.fn(), listMyBookings: vi.fn(), respondToBooking: vi.fn(), sendBookingMessage: vi.fn(),
}));
vi.mock("./consultantApi", () => api);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { useBookingsStore, type Booking } from "./bookings";
import { useConsultantStore } from "./consultantProfile";
import { setMarketplaceScope } from "./marketplace-scope";
import { useSessionTransition } from "./session/transition";
import { pullProfile, pushProfile, pullInbox, pullMyBookings, pushBookingCreate, pushBookingMessage, pushBookingRespond, type ProfileChanges } from "./marketplaceSync";
import type { BookingDTO, ConsultantProfileDTO } from "./consultantApi";

const profile = (patch: Partial<ConsultantProfileDTO> = {}): ConsultantProfileDTO => ({
  id: "consultant-1", initials: "JD", fullName: "Jane Doe", role: "Advisor", bio: "A sufficiently long professional biography.",
  specialty: "Reviews", specialties: ["Grievance"], price: 150, currency: "GBP", sla: "24-48h", availability: "this_week",
  rating: 0, reviews: 0, photoUrl: null, status: "pending_review", updatedAt: 100, ...patch,
});
const booking = (patch: Partial<BookingDTO> = {}): BookingDTO => ({
  id: "booking-1", consultantProfileId: "consultant-1", draftId: "draft-1", matterTitle: "Private matter", message: "Review please",
  status: "requested", responseNote: null, deliveryNote: null, rating: null, shareToken: null, shareTokenExpiresAt: null,
  messages: [], bookedAt: 100, expectedDeliveryAt: 200, acceptedAt: null, deliveredAt: null, completedAt: null, ...patch,
});
const edit: ProfileChanges = {
  fullName: "Jane Changed", role: "Advisor", bio: "An edited sufficiently long professional biography.", specialty: "Advice",
  specialties: ["Grievance"], price: 200, currency: "£", sla: "24-48h", availability: "this_week", photoUrl: "",
};
const cached = (patch: Partial<Booking> = {}): Booking => ({
  id: "booking-1", consultantProfileId: "consultant-1", consultantInitials: "JD", draftId: "draft-1",
  status: "requested", bookedAt: 100, expectedDeliveryAt: 200, messages: [], ...patch,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useSessionTransition.setState({ label: null, epoch: 0 });
  setMarketplaceScope(null, null);
  setMarketplaceScope("user-1", "workspace-1");
  api.getConsultantProfile.mockResolvedValue({ ok: true, data: { profile: profile() } });
  api.listMyBookings.mockResolvedValue({ ok: true, data: { bookings: [] } });
  api.getInbox.mockResolvedValue({ ok: true, data: { bookings: [], profileStatus: "published" } });
});
afterEach(() => { vi.useRealTimers(); });

function cancelTransition() {
  useSessionTransition.setState((state) => ({ label: "Signing out", epoch: state.epoch + 1 }));
  useSessionTransition.setState({ label: null });
}

describe("server-authoritative profile", () => {
  it("keeps accepted content while saving and on failure; no local saved profile is manufactured", async () => {
    await pullProfile();
    const accepted = useConsultantStore.getState().profile;
    const response = deferred<unknown>(); api.saveConsultantProfile.mockReturnValue(response.promise);
    const saving = pushProfile(edit);
    expect(useConsultantStore.getState().profile).toBe(accepted);
    response.resolve({ ok: false, status: 503, error: "Unavailable" });
    expect(await saving).toBe(false);
    expect(useConsultantStore.getState().profile).toBe(accepted);
    expect(useConsultantStore.getState().lastSync.state).toBe("error");
    expect(localStorage.length).toBe(0);
  });

  it("uses the server's initials, content and moderation status on save", async () => {
    api.saveConsultantProfile.mockResolvedValue({ ok: true, data: { profile: profile({ initials: "JC", fullName: "Jane Changed", status: "pending_review" }) } });
    expect(await pushProfile(edit)).toBe(true);
    expect(api.saveConsultantProfile).toHaveBeenCalledWith({ ...edit, currency: "GBP", photoUrl: null });
    expect(useConsultantStore.getState().profile).toMatchObject({ initials: "JC", fullName: "Jane Changed", status: "pending_review" });
    expect(localStorage.length).toBe(0);
  });

  it("clears a cached profile when the server returns null", async () => {
    await pullProfile();
    api.getConsultantProfile.mockResolvedValue({ ok: true, data: { profile: null } });
    expect(await pullProfile()).toBe(true);
    expect(useConsultantStore.getState().profile).toBeNull();
  });

  it("does not allow an older load to overwrite a newer accepted save", async () => {
    const response = deferred<unknown>(); api.getConsultantProfile.mockReturnValue(response.promise);
    const loading = pullProfile();
    api.saveConsultantProfile.mockResolvedValue({ ok: true, data: { profile: profile({ fullName: "Jane Changed" }) } });
    await pushProfile(edit);
    response.resolve({ ok: true, data: { profile: profile() } });
    expect(await loading).toBe(false);
    expect(useConsultantStore.getState().profile?.fullName).toBe("Jane Changed");
  });

  it.each(["load", "save"])("discards a late profile %s after an account switch", async (kind) => {
    const response = deferred<unknown>();
    (kind === "load" ? api.getConsultantProfile : api.saveConsultantProfile).mockReturnValue(response.promise);
    const pending = kind === "load" ? pullProfile() : pushProfile(edit);
    setMarketplaceScope("user-2", "workspace-2");
    response.resolve({ ok: true, data: { profile: profile() } });
    expect(await pending).toBe(false);
    expect(useConsultantStore.getState().profile).toBeNull();
  });
});

describe("server-authoritative bookings", () => {
  it("replaces complete snapshots and keeps the two audiences separate", async () => {
    useBookingsStore.setState({ bookings: [cached({ id: "withdrawn" })] });
    api.getInbox.mockResolvedValue({ ok: true, data: { bookings: [booking({ id: "inbound" })], profileStatus: "published" } });
    await pullInbox(); await pullMyBookings();
    expect(useBookingsStore.getState().bookings).toEqual([]);
    expect(useBookingsStore.getState().inbox.map((b) => b.id)).toEqual(["inbound"]);
    expect(useBookingsStore.getState().bookingsForConsultant("JD", "other-profile")).toEqual([]);
    expect(useBookingsStore.getState().bookingsForConsultant("JD")).toEqual([]);
  });

  it("ignores out-of-order list replies", async () => {
    const first = deferred<unknown>(); api.listMyBookings.mockReturnValueOnce(first.promise);
    const old = pullMyBookings();
    api.listMyBookings.mockResolvedValueOnce({ ok: true, data: { bookings: [booking({ id: "new" })] } });
    await pullMyBookings();
    first.resolve({ ok: true, data: { bookings: [booking({ id: "old" })] } });
    expect(await old).toBe(false);
    expect(useBookingsStore.getState().bookings.map((b) => b.id)).toEqual(["new"]);
  });

  it("creates no optimistic booking and returns the accepted server record", async () => {
    const response = deferred<unknown>(); api.createBooking.mockReturnValue(response.promise);
    const pending = pushBookingCreate({ consultantProfileId: "consultant-1", draftId: "server-draft" }, "JD", "readable-draft");
    expect(useBookingsStore.getState().bookings).toEqual([]);
    response.resolve({ ok: true, data: { booking: booking({ id: "server-booking" }) } });
    const accepted = await pending;
    expect(accepted).toMatchObject({ id: "server-booking", localDraftId: "readable-draft" });
    expect(useBookingsStore.getState().bookings).toEqual([accepted]);
    expect(localStorage.length).toBe(0);
  });

  it("keeps the requested status until acceptance and blocks stale snapshots afterward", async () => {
    useBookingsStore.setState({ bookings: [cached()], inbox: [cached()] });
    const response = deferred<unknown>(), list = deferred<unknown>();
    api.respondToBooking.mockReturnValue(response.promise); api.listMyBookings.mockReturnValue(list.promise);
    const pending = pushBookingRespond("booking-1", "accept");
    const loading = pullMyBookings();
    expect(useBookingsStore.getState().bookings[0].status).toBe("requested");
    response.resolve({ ok: true, data: { booking: booking({ status: "accepted", shareToken: "token" }) } });
    expect(await pending).toBe(true);
    list.resolve({ ok: true, data: { bookings: [booking()] } });
    expect(await loading).toBe(false);
    expect(useBookingsStore.getState().bookings[0].status).toBe("accepted");
    expect(useBookingsStore.getState().inbox[0].shareToken).toBe("token");
  });

  it("adds no phantom message and does not send twice while one request is pending", async () => {
    useBookingsStore.setState({ bookings: [cached()] });
    const response = deferred<unknown>(); api.sendBookingMessage.mockReturnValue(response.promise);
    const pending = pushBookingMessage("booking-1", "requester", "hello");
    expect(await pushBookingMessage("booking-1", "requester", "duplicate")).toBe(false);
    expect(api.sendBookingMessage).toHaveBeenCalledTimes(1);
    expect(useBookingsStore.getState().bookings[0].messages).toEqual([]);
    response.resolve({ ok: false, error: "Network", status: 0 });
    expect(await pending).toBe(false);
    expect(useBookingsStore.getState().bookings[0].messages).toEqual([]);
  });

  it.each(["create", "respond", "message", "list", "inbox"])("rejects a late booking %s after switching workspace", async (kind) => {
    useBookingsStore.setState({ bookings: [cached()], inbox: [cached()] });
    const response = deferred<unknown>();
    const mocks = { create: api.createBooking, respond: api.respondToBooking, message: api.sendBookingMessage, list: api.listMyBookings, inbox: api.getInbox };
    mocks[kind as keyof typeof mocks].mockReturnValue(response.promise);
    const actions = {
      create: () => pushBookingCreate({ consultantProfileId: "consultant-1" }, "JD"),
      respond: () => pushBookingRespond("booking-1", "accept"),
      message: () => pushBookingMessage("booking-1", "requester", "hello"),
      list: pullMyBookings, inbox: pullInbox,
    };
    const pending = actions[kind as keyof typeof actions]();
    setMarketplaceScope("user-1", "workspace-2");
    response.resolve({ ok: true, data: { booking: booking(), bookings: [booking()], messages: [] } });
    expect(await pending).toBeFalsy();
    expect(useBookingsStore.getState()).toMatchObject({ bookings: [], inbox: [] });
  });

  it("uses an error state, not a false empty inbox, when the server is unavailable", async () => {
    api.getInbox.mockResolvedValue({ ok: false, error: "Unavailable", status: 503 });
    expect(await pullInbox()).toBe(false);
    expect(useBookingsStore.getState().inboxState).toBe("error");
  });

  it("does not make authenticated API requests without an established session", async () => {
    setMarketplaceScope(null, null);
    expect(await pullMyBookings()).toBe(false);
    expect(await pushProfile(edit)).toBe(false);
    expect(await pushBookingCreate({ consultantProfileId: "consultant-1" }, "JD")).toBeNull();
    expect(api.listMyBookings).not.toHaveBeenCalled();
    expect(api.saveConsultantProfile).not.toHaveBeenCalled();
    expect(api.createBooking).not.toHaveBeenCalled();
  });
});

describe("cancelled session transition recovery", () => {
  it.each(["profile", "inbox", "list"] as const)("refetches %s instead of accepting a pre-transition reply", async (kind) => {
    const response = deferred<unknown>();
    const read = { profile: api.getConsultantProfile, inbox: api.getInbox, list: api.listMyBookings }[kind];
    const action = { profile: pullProfile, inbox: pullInbox, list: pullMyBookings }[kind];
    read.mockReturnValueOnce(response.promise).mockResolvedValueOnce({
      ok: true, data: { profile: profile({ fullName: "Fresh server profile" }), bookings: [booking({ id: "fresh" })] },
    });
    const pending = action();
    cancelTransition();
    response.resolve({ ok: true, data: { profile: profile({ fullName: "Stale reply" }), bookings: [booking({ id: "stale" })] } });
    expect(await pending).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
    if (kind === "profile") {
      expect(useConsultantStore.getState().profile?.fullName).toBe("Fresh server profile");
      expect(useConsultantStore.getState().lastSync.state).toBe("ok");
    } else {
      expect(useBookingsStore.getState()[kind === "inbox" ? "inbox" : "bookings"].map((row) => row.id)).toEqual(["fresh"]);
      if (kind === "inbox") expect(useBookingsStore.getState().inboxState).toBe("ready");
    }
  });

  it("waits for transition release before issuing its recovery read", async () => {
    const response = deferred<unknown>();
    api.getConsultantProfile.mockReturnValueOnce(response.promise);
    const pending = pullProfile();
    useSessionTransition.setState({ label: "Switching", epoch: 1 });
    response.resolve({ ok: true, data: { profile: null } });
    await Promise.resolve(); await Promise.resolve();
    expect(api.getConsultantProfile).toHaveBeenCalledTimes(1);
    expect(useConsultantStore.getState().lastSync.state).toBe("pending");
    useSessionTransition.setState({ label: null });
    expect(await pending).toBe(true);
    expect(api.getConsultantProfile).toHaveBeenCalledTimes(2);
  });

  it.each(["profile", "inbox", "list"] as const)("rejects a recovered %s response if identity changes during the fresh request", async (kind) => {
    const original = deferred<unknown>(), recovery = deferred<unknown>();
    const read = { profile: api.getConsultantProfile, inbox: api.getInbox, list: api.listMyBookings }[kind];
    const action = { profile: pullProfile, inbox: pullInbox, list: pullMyBookings }[kind];
    read.mockReturnValueOnce(original.promise).mockImplementationOnce(() => {
      setMarketplaceScope("new-user", "new-workspace");
      return recovery.promise;
    });
    const pending = action();
    cancelTransition();
    original.resolve({ ok: true, data: { profile: profile(), bookings: [booking()] } });
    recovery.resolve({ ok: true, data: { profile: profile(), bookings: [booking()] } });
    expect(await pending).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(useConsultantStore.getState()).toMatchObject({ profile: null, lastSync: { state: "idle" } });
    expect(useBookingsStore.getState()).toMatchObject({ bookings: [], inbox: [], inboxState: "idle" });
  });

  it("does not overwrite a newer accepted save with the recovery read", async () => {
    const original = deferred<unknown>(), recovery = deferred<unknown>();
    const started = deferred<void>();
    api.getConsultantProfile.mockReturnValueOnce(original.promise).mockImplementationOnce(() => {
      started.resolve();
      return recovery.promise;
    });
    const pending = pullProfile();
    cancelTransition();
    original.resolve({ ok: true, data: { profile: profile() } });
    await started.promise;
    api.saveConsultantProfile.mockResolvedValue({ ok: true, data: { profile: profile({ fullName: "Newer save" }) } });
    expect(await pushProfile(edit)).toBe(true);
    recovery.resolve({ ok: true, data: { profile: profile({ fullName: "Old snapshot" }) } });
    expect(await pending).toBe(false);
    expect(useConsultantStore.getState()).toMatchObject({ profile: { fullName: "Newer save" }, lastSync: { state: "ok" } });
  });

  it.each(["profile", "inbox"] as const)("settles %s recovery failure without erasing accepted data", async (kind) => {
    await pullProfile();
    useBookingsStore.setState({ inbox: [cached()], inboxState: "ready" });
    const acceptedProfile = useConsultantStore.getState().profile;
    const response = deferred<unknown>();
    const read = kind === "profile" ? api.getConsultantProfile : api.getInbox;
    read.mockReturnValueOnce(response.promise).mockResolvedValueOnce({ ok: false, status: 503, error: "Unavailable" });
    const pending = kind === "profile" ? pullProfile() : pullInbox();
    cancelTransition();
    response.resolve({ ok: true, data: { profile: null, bookings: [] } });
    expect(await pending).toBe(false);
    expect(useConsultantStore.getState().profile).toBe(acceptedProfile);
    expect(useBookingsStore.getState().inbox.map((row) => row.id)).toEqual(["booking-1"]);
    expect(kind === "profile" ? useConsultantStore.getState().lastSync.state : useBookingsStore.getState().inboxState).toBe("error");
  });

  it("does not loop forever when another transition invalidates the recovery read", async () => {
    const original = deferred<unknown>(), recovery = deferred<unknown>();
    api.getConsultantProfile.mockReturnValueOnce(original.promise).mockImplementationOnce(() => {
      cancelTransition();
      return recovery.promise;
    });
    const pending = pullProfile();
    cancelTransition();
    original.resolve({ ok: true, data: { profile: profile() } });
    recovery.resolve({ ok: true, data: { profile: profile() } });
    expect(await pending).toBe(false);
    expect(api.getConsultantProfile).toHaveBeenCalledTimes(2);
    expect(useConsultantStore.getState()).toMatchObject({ profile: null, lastSync: { state: "error" } });
  });

  it.each([false, true])("cancels recovery when identity changes during a transition (return to original: %s)", async (returnToOriginal) => {
    const response = deferred<unknown>();
    api.getConsultantProfile.mockReturnValueOnce(response.promise);
    const pending = pullProfile();
    useSessionTransition.setState({ label: "Switching", epoch: 1 });
    response.resolve({ ok: true, data: { profile: profile() } });
    await Promise.resolve(); await Promise.resolve();
    setMarketplaceScope("other-user", "other-workspace");
    if (returnToOriginal) setMarketplaceScope("user-1", "workspace-1");
    useSessionTransition.setState({ label: null });
    expect(await pending).toBe(false);
    expect(api.getConsultantProfile).toHaveBeenCalledTimes(1);
    expect(useConsultantStore.getState()).toMatchObject({ profile: null, lastSync: { state: "idle" } });
  });

  it("reconciles a superseded profile save without accepting its reply or replaying the write", async () => {
    const response = deferred<unknown>();
    api.saveConsultantProfile.mockReturnValue(response.promise);
    api.getConsultantProfile.mockResolvedValue({ ok: true, data: { profile: profile({ fullName: "Fresh accepted value" }) } });
    const pending = pushProfile(edit);
    cancelTransition();
    expect(await pushProfile(edit)).toBe(false);
    response.resolve({ ok: true, data: { profile: profile({ fullName: "Discarded save reply" }) } });
    expect(await pending).toBe(false);
    expect(api.saveConsultantProfile).toHaveBeenCalledTimes(1);
    expect(api.getConsultantProfile).toHaveBeenCalledTimes(1);
    expect(useConsultantStore.getState()).toMatchObject({ profile: { fullName: "Fresh accepted value" }, lastSync: { state: "ok" } });
  });

  it("settles a profile save if its transition never finishes", async () => {
    vi.useFakeTimers();
    const response = deferred<unknown>(); api.saveConsultantProfile.mockReturnValue(response.promise);
    const pending = pushProfile(edit);
    useSessionTransition.setState({ label: "Signing out", epoch: 1 });
    response.resolve({ ok: true, data: { profile: profile() } });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toBe(false);
    expect(useConsultantStore.getState().lastSync.state).toBe("error");
    expect(api.getConsultantProfile).not.toHaveBeenCalled();
  });

  it.each(["create", "respond", "message"] as const)("reconciles %s from a fresh snapshot after cancellation, never resending it", async (kind) => {
    const response = deferred<unknown>();
    const write = { create: api.createBooking, respond: api.respondToBooking, message: api.sendBookingMessage }[kind];
    write.mockReturnValue(response.promise);
    api.listMyBookings.mockResolvedValue({ ok: true, data: { bookings: [booking({ id: "fresh" })] } });
    api.getInbox.mockResolvedValue({ ok: true, data: { bookings: [booking({ id: "fresh-inbox" })] } });
    const pending = kind === "create" ? pushBookingCreate({ consultantProfileId: "consultant-1" }, "JD")
      : kind === "respond" ? pushBookingRespond("booking-1", "accept") : pushBookingMessage("booking-1", "requester", "hello");
    cancelTransition();
    response.resolve({ ok: true, data: { booking: booking({ id: "stale" }), messages: [] } });
    expect(await pending).toBeFalsy();
    expect(write).toHaveBeenCalledTimes(1);
    expect(api.listMyBookings).toHaveBeenCalledTimes(1);
    expect(useBookingsStore.getState().bookings.map((row) => row.id)).toEqual(["fresh"]);
    if (kind !== "create") {
      expect(useBookingsStore.getState()).toMatchObject({ inboxState: "ready" });
      expect(useBookingsStore.getState().inbox.map((row) => row.id)).toEqual(["fresh-inbox"]);
    }
  });
});
