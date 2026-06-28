import { describe, it, expect, beforeEach } from "vitest";
import { useConsultantStore, type ConsultantProfile } from "@/lib/consultantProfile";

// status is server-owned moderation state ("published" etc.) set only by
// hydrateFromServer. A local edit via saveProfile must preserve it — otherwise
// on a failed push the marketplace card silently reverts to "not published".
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

describe("consultant saveProfile — preserves server-owned status", () => {
  beforeEach(() => {
    useConsultantStore.getState().reset();
  });

  it("keeps the published status through a local field edit", () => {
    useConsultantStore.getState().hydrateFromServer(serverProfile());
    expect(useConsultantStore.getState().profile?.status).toBe("published");

    // The edit form sends content fields only, never status.
    useConsultantStore.getState().saveProfile({ bio: "Updated bio" });

    const after = useConsultantStore.getState().profile;
    expect(after?.bio).toBe("Updated bio");
    expect(after?.status).toBe("published");
  });

  it("keeps a non-published status too (does not silently 'promote' to undefined)", () => {
    useConsultantStore.getState().hydrateFromServer(serverProfile({ status: "pending_review" }));
    useConsultantStore.getState().saveProfile({ price: 200 });
    expect(useConsultantStore.getState().profile?.status).toBe("pending_review");
  });
});
