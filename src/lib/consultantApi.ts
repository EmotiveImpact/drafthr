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
      // Spread `init` BEFORE headers so method/body override the baseline but
      // the merged headers object always wins. (Previously `...init` came last,
      // so a caller passing `init.headers` would clobber the merged object and
      // silently drop Content-Type/Accept. No current caller passes headers —
      // latent — but this keeps the shared chokepoint correct for future ones.)
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
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

// ─── Stripe payments ───────────────────────────────────────────────────

export type StripeConnectStatus = {
  /** Whether the server has Stripe keys configured at all. */
  configured: boolean;
  hasProfile: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

/** Consultant payout status (Stripe Connect). */
export function getStripeConnectStatus() {
  return call<StripeConnectStatus>("/api/marketplace/stripe-connect");
}

/** Start (or resume) Stripe Connect onboarding — returns a URL to redirect to. */
export function startStripeConnect() {
  return call<{ url: string }>("/api/marketplace/stripe-connect", { method: "POST" });
}

/** Begin Stripe Checkout to pay for a booking — returns a URL to redirect to. */
export function startBookingCheckout(bookingId: string) {
  return call<{ url: string }>("/api/marketplace/stripe-checkout", {
    method: "POST",
    body: JSON.stringify({ bookingId }),
  });
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

export type BookingPaymentStatus =
  | "unpaid"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "disputed"
  | "dispute_lost";

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
  /** Price agreed when the booking was placed, minor units + lowercase ISO
   *  currency. What checkout charges, whatever the consultant's rate is now. */
  priceAmount?: number | null;
  priceCurrency?: string | null;
  /** Only "paid" lets the consultant start work and opens the draft. */
  paymentStatus?: BookingPaymentStatus;
  shareToken: string | null;
  shareTokenExpiresAt: number | null;
  messages: BookingMessageDTO[];
  bookedAt: number;
  expectedDeliveryAt: number | null;
  acceptedAt: number | null;
  deliveredAt: number | null;
  completedAt: number | null;
  /** When the consultant declined; null for other statuses and for
   *  bookings declined before the column existed. */
  declinedAt?: number | null;
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
  action: "accept" | "decline" | "deliver" | "complete" | "rate",
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

// ─── Admin (server-gated by DRAFTHR_ADMIN_EMAILS) ──────────────────────

export type AdminProfileDTO = {
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
  photoUrl: string | null;
  status: "pending_review" | "published" | "paused" | "rejected" | "suspended";
  email: string | null;
  createdAt: number;
  updatedAt: number;
};

/** Cross-tenant vetting queue. 403 unless the caller is a server-side
 *  admin (DRAFTHR_ADMIN_EMAILS). `all` returns every profile, not just
 *  pending_review. */
export function getAdminQueue(all = false) {
  return call<{ profiles: AdminProfileDTO[]; count: number }>(
    `/api/marketplace/admin-queue${all ? "?status=all" : ""}`,
  );
}

/** Approve (publish) or reject a consultant profile. Admin-only. */
export function adminReviewProfile(profileId: string, action: "approve" | "reject") {
  return call<{ ok: true; id: string; status: string }>(
    "/api/marketplace/admin-review",
    { method: "POST", body: JSON.stringify({ profileId, action }) },
  );
}
