/**
 * Thin client for the consultant marketplace API.
 *
 * Wraps fetch with credentials: 'same-origin', accept: application/json,
 * and a consistent error shape ({ ok, error?, data? }). Used by the
 * consultant profile store and the marketplace / bookings hooks below.
 *
 * Why a separate module: keeps every API caller using the same
 * envelope, and gives us a single chokepoint to inject auth headers or
 * retry behaviour when the platform layer needs it.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    });
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("application/json") ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      const error =
        typeof body === "object" && body && "error" in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, error, status: res.status };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
      status: 0,
    };
  }
}

// ─── Consultant profile ────────────────────────────────────────────────

export type AvailabilityCode =
  | "this_week"
  | "one_two_weeks"
  | "three_four_weeks"
  | "booked";

export type ConsultantProfileDTO = {
  id: string;
  initials: string;
  fullName: string;
  role: string;
  bio: string;
  specialty: string;
  specialties: string[];
  price: number;
  currency: "GBP" | "USD" | "EUR";
  sla: string;
  availability: AvailabilityCode;
  rating: number;
  reviews: number;
  photoUrl: string | null;
  status?: "pending_review" | "published" | "paused" | "rejected" | "suspended";
  updatedAt?: number;
};

export function getConsultantProfile() {
  return call<{ profile: ConsultantProfileDTO | null }>("/api/marketplace/profile");
}

export function saveConsultantProfile(
  input: Partial<Omit<ConsultantProfileDTO, "id" | "rating" | "reviews" | "status" | "updatedAt">>,
) {
  // input may carry availability now — the server validates the enum.
  return call<{ profile: ConsultantProfileDTO; created: boolean }>(
    "/api/marketplace/profile",
    { method: "POST", body: JSON.stringify(input) },
  );
}

// ─── Marketplace listing ───────────────────────────────────────────────

export type MarketplaceConsultantDTO = Omit<ConsultantProfileDTO, "status" | "updatedAt">;

export function listMarketplace(params?: {
  q?: string;
  tags?: string[];
  sort?: "rating" | "price-asc" | "price-desc" | "sla";
  limit?: number;
  offset?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  (params?.tags ?? []).forEach((t) => sp.append("tag", t));
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.offset != null) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return call<{ consultants: MarketplaceConsultantDTO[]; count: number }>(
    `/api/marketplace/listing${qs ? `?${qs}` : ""}`,
  );
}

// ─── Bookings ──────────────────────────────────────────────────────────

export type BookingMessageDTO = {
  id: string;
  from: "requester" | "consultant";
  text: string;
  ts: number;
};

export type BookingDTO = {
  id: string;
  consultantProfileId: string;
  draftId: string | null;
  matterTitle: string | null;
  message: string | null;
  status: "requested" | "accepted" | "declined" | "delivered" | "completed";
  responseNote: string | null;
  deliveryNote: string | null;
  rating: number | null;
  shareToken: string | null;
  shareTokenExpiresAt: number | null;
  messages: BookingMessageDTO[];
  bookedAt: number;
  expectedDeliveryAt: number | null;
  acceptedAt: number | null;
  deliveredAt: number | null;
  completedAt: number | null;
  /** Only present on /api/bookings/inbox responses. */
  requesterEmail?: string | null;
  requesterName?: string | null;
  /** Consultant display fields — present on /api/bookings/list responses
   *  (joined server-side) so the HR list renders name/photo without a
   *  client-side card lookup that fails cross-device. */
  consultantName?: string | null;
  consultantInitials?: string | null;
  consultantRole?: string | null;
  consultantPhotoUrl?: string | null;
  consultantCurrency?: "GBP" | "USD" | "EUR" | null;
  consultantPrice?: number | null;
};

export function listMyBookings() {
  return call<{ bookings: BookingDTO[] }>("/api/marketplace/bookings-list");
}

export function getInbox() {
  return call<{ bookings: BookingDTO[]; profileStatus: string }>("/api/marketplace/bookings-inbox");
}

export function createBooking(input: {
  consultantProfileId: string;
  draftId?: string | null;
  matterTitle?: string;
  message?: string;
  expectedDeliveryAt?: string;
}) {
  return call<{ booking: BookingDTO }>("/api/marketplace/bookings-create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function respondToBooking(
  bookingId: string,
  action: "accept" | "decline" | "deliver" | "complete",
  opts?: { note?: string; rating?: number },
) {
  return call<{ booking: BookingDTO }>("/api/marketplace/bookings-respond", {
    method: "POST",
    body: JSON.stringify({ bookingId, action, note: opts?.note, rating: opts?.rating }),
  });
}

// ─── Shared-draft (matter-scoped) ──────────────────────────────────────

export type SharedDraftDTO = {
  booking: {
    id: string;
    matterTitle: string | null;
    message: string | null;
    status: BookingDTO["status"];
    acceptedAt: number | null;
    deliveredAt: number | null;
    expectedDeliveryAt: number | null;
  };
  draft: {
    id: string;
    letterType: string;
    mode: string;
    jurisdiction: string | null;
    title: string | null;
    sections: { id: string; title: string; html: string; position: number }[];
  };
  consultantProfile: { id: string; fullName: string; initials: string } | null;
};

/** Resolve a share token into the underlying draft. Server enforces
 *  that the caller's session matches the booking's assigned consultant
 *  and that the token hasn't expired. */
export function getSharedDraft(token: string) {
  // Token in the query (not the path): the marketplace function only
  // matches single-segment paths, so /api/marketplace/shared/<token>
  // (two segments) would 404.
  return call<SharedDraftDTO>(`/api/marketplace/shared?token=${encodeURIComponent(token)}`);
}

/** Append a chat message to a booking thread. Server derives the 'from'
 *  field from the caller's role on the booking — never trusted from the
 *  body — so the consultant can't impersonate HR or vice versa. */
export function sendBookingMessage(bookingId: string, text: string) {
  return call<{ messages: BookingMessageDTO[]; message: BookingMessageDTO }>(
    "/api/marketplace/bookings-message",
    {
      method: "POST",
      body: JSON.stringify({ bookingId, text }),
    },
  );
}
