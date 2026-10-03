import { describe, it, expect, beforeEach } from "vitest";
import { useConsultantStore, type ConsultantProfile } from "@/lib/consultantProfile";

// The accepted profile stays unchanged while a form save is pending or fails.
function serverProfile(overrides: Partial<ConsultantProfile> = {}): ConsultantProfile {
  return {
    id: "prof_1",
    initials: "JS",
    fullName: "Jane Smith",
    role: "Employment Solicitor",
    bio: "Bio",
    specialty: "Employment",
    specialties: [],
    price: 150,
    currency: "£",
    sla: "24-48h",
    rating: 5,
    reviews: 0,
    avatarFrom: "#f3dca5",
    avatarTo: "#e9b75c",
    photoUrl: "",
    availability: "this_week",
    payout: { stripeAccountId: null, payoutsEnabled: false },
    status: "published",
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("consultant cache — preserves server-owned status", () => {
  beforeEach(() => {
    useConsultantStore.getState().reset();
  });

  it("keeps accepted content and published status while a save is pending", () => {
    useConsultantStore.getState().hydrateFromServer(serverProfile());
    expect(useConsultantStore.getState().profile?.status).toBe("published");

    useConsultantStore.getState().setSync("pending");

    const after = useConsultantStore.getState().profile;
    expect(after?.bio).toBe("Bio");
    expect(after?.status).toBe("published");
  });

  it("keeps accepted content and non-published status after a failed save", () => {
    useConsultantStore.getState().hydrateFromServer(serverProfile({ status: "pending_review" }));
    useConsultantStore.getState().setSync("error", "request failed");
    expect(useConsultantStore.getState().profile?.price).toBe(150);
    expect(useConsultantStore.getState().profile?.status).toBe("pending_review");
  });
});
