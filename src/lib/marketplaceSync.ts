/**
 * Marketplace dual-write sync layer.
 *
 * The client uses the local zustand stores (useConsultantStore,
 * useBookingsStore) as the source of truth for the UI — instant,
 * offline-friendly, no jank waiting on the network. The helpers here
 * mirror every mutation to the API so the data lives on the server
 * too, and provide hydrate-on-mount functions that pull the server's
 * canonical state and merge it back into the local store.
 *
 * Network failures are soft: the user keeps their change locally
 * regardless. A small `lastSync` flag on the store lets the UI show a
 * "saved locally — will retry when online" affordance if needed.
 */
import { toast } from "sonner";
import {
  getConsultantProfile,
  saveConsultantProfile,
  createBooking,
  getInbox,
  listMyBookings,
  respondToBooking,
  sendBookingMessage,
  type ConsultantProfileDTO,
  type BookingDTO,
} from "@/lib/consultantApi";
import { useConsultantStore, type Availability } from "@/lib/consultantProfile";
import {
  useBookingsStore,
  type Booking,
  type BookingStatus,
} from "@/lib/bookings";

// ─── Profile ─────────────────────────────────────────────────────────

/** Map server DTO → local store shape. */
function dtoToProfile(dto: ConsultantProfileDTO) {
  // Currency comes back as an ISO code; the local store still uses the
  // symbol form so we translate.
  const symbolByCode: Record<ConsultantProfileDTO["currency"], "£" | "$" | "€"> = {
    GBP: "£",
    USD: "$",
    EUR: "€",
  };
  return {
    id: dto.id,
    initials: dto.initials,
    fullName: dto.fullName,
    role: dto.role,
    bio: dto.bio,
    specialty: dto.specialty,
    // Default to [] like the other server fields below: unvalidated server
    // JSON may omit specialties (e.g. a row created before the column
    // existed), and the first `profile.specialties.length` read would throw
    // → white screen. Mirrors the persisted-store `migrate` guard.
    specialties: dto.specialties ?? [],
    price: dto.price,
    currency: symbolByCode[dto.currency] ?? "£",
    sla: dto.sla,
    rating: dto.rating,
    reviews: dto.reviews,
    avatarFrom: "#f3dca5",
    avatarTo: "#e9b75c",
    photoUrl: dto.photoUrl ?? "",
    availability: (dto.availability ?? "this_week") as Availability,
    // Payout isn't server-backed yet (Stripe Connect not wired). Preserve
    // whatever the local store already holds so a profile pull doesn't wipe
    // a payout state set elsewhere; default to the disconnected state.
    payout:
      useConsultantStore.getState().profile?.payout ?? {
        stripeAccountId: null,
        payoutsEnabled: false,
      },
    updatedAt: dto.updatedAt ?? Date.now(),
    status: dto.status,
  };
}

/** Fetch the signed-in consultant's profile from the server and merge
 *  into the local store. Silent no-op if the user isn't enrolled
 *  server-side yet (the local profile, if any, wins). */
export async function pullProfile(): Promise<void> {
  const res = await getConsultantProfile();
  if (!res.ok) {
    useConsultantStore.getState().setSync("local", res.error);
    return;
  }
  if (res.data.profile) {
    useConsultantStore.getState().hydrateFromServer(dtoToProfile(res.data.profile));
  }
}

/** Persist the locally-saved profile to the server. Currency translates
 *  from the symbol form the local store keeps. Returns true only when the
 *  server accepted the profile (i.e. it's actually published to the
 *  cross-tenant marketplace) so callers don't show a false "Saved". */
export async function pushProfile(): Promise<boolean> {
  const p = useConsultantStore.getState().profile;
  if (!p) return false;
  const codeByCurrency: Record<"£" | "$" | "€", "GBP" | "USD" | "EUR"> = {
    "£": "GBP",
    "$": "USD",
    "€": "EUR",
  };
  useConsultantStore.getState().setSync("pending");
  const res = await saveConsultantProfile({
    fullName: p.fullName,
    role: p.role,
    bio: p.bio,
    specialty: p.specialty,
    specialties: p.specialties,
    price: p.price,
    currency: codeByCurrency[p.currency],
    sla: p.sla,
    availability: p.availability,
    photoUrl: p.photoUrl || null,
  });
  if (!res.ok) {
    useConsultantStore.getState().setSync("local", res.error);
    return false;
  }
  useConsultantStore.getState().hydrateFromServer(dtoToProfile(res.data.profile));
  // Editing a vetted field (rate, credentials, bio, specialties) sends a live
  // profile back to the review queue. Say so, rather than letting the
  // consultant assume they're still listed.
  if (p.status === "published" && res.data.profile.status === "pending_review") {
    toast.info(
      "Your changes need a quick review before your profile is listed again. You're hidden from the marketplace until then.",
    );
  }
  return true;
}

// ─── Bookings ────────────────────────────────────────────────────────

/** Map server booking DTO into the local Booking shape. The local model
 *  keys bookings by consultantInitials (we don't have the consultant's
 *  user id in the inbox response), so we use the dto id as the booking id
 *  and the consultantProfileId stub as initials when there's no profile
 *  data attached. */
function dtoToBooking(
  dto: BookingDTO & { shareToken?: string | null; shareTokenExpiresAt?: number | null },
  consultantInitials: string,
  prior?: Booking,
): Booking {
  return {
    id: dto.id,
    consultantInitials,
    consultantProfileId: dto.consultantProfileId,
    draftId: dto.draftId ?? "",
    // Preserve the original readable draft id so the HR "Open draft" link
    // keeps working after sync — the server only knows the hashed UUID, which
    // the editor store can't resolve. (Bug #3: link dead-ended on "Draft not
    // found" once a booking synced.)
    localDraftId: prior?.localDraftId ?? prior?.draftId,
    matterTitle: dto.matterTitle ?? undefined,
    message: dto.message ?? undefined,
    responseNote: dto.responseNote ?? undefined,
    deliveryNote: dto.deliveryNote ?? undefined,
    rating: dto.rating ?? undefined,
    bookedAt: dto.bookedAt,
    acceptedAt: dto.acceptedAt ?? undefined,
    deliveredAt: dto.deliveredAt ?? undefined,
    completedAt: dto.completedAt ?? undefined,
    declinedAt: dto.declinedAt ?? prior?.declinedAt,
    // Like the consultant display fields below, the respond/create/message
    // DTOs don't carry expectedDeliveryAt (only the list-join does). Fall back
    // to the prior local row so a state transition doesn't silently reset the
    // SLA deadline to "now + 24h" and make an overdue booking look on-time.
    expectedDeliveryAt:
      dto.expectedDeliveryAt ?? prior?.expectedDeliveryAt ?? Date.now() + 24 * 60 * 60 * 1000,
    status: dto.status as BookingStatus,
    shareToken: dto.shareToken ?? undefined,
    shareTokenExpiresAt: dto.shareTokenExpiresAt ?? undefined,
    messages: dto.messages ?? [],
    // The consultant display fields are produced ONLY by the list-join
    // (list-and-create.ts) — the respond/create/message DTOs don't carry
    // them. When they're absent, fall back to whatever the prior local row
    // held so a state transition (accept/deliver/complete/rate) doesn't wipe
    // the consultant's name/photo/price from the card. (Bug: completing a
    // booking dropped the avatar + showed "Specialist · INITIALS".)
    consultantName: dto.consultantName ?? prior?.consultantName,
    consultantRole: dto.consultantRole ?? prior?.consultantRole,
    consultantPhotoUrl: dto.consultantPhotoUrl ?? prior?.consultantPhotoUrl,
    // Only the consultant's inbox carries who booked; keep it across the
    // respond/message DTOs that don't.
    requesterName: dto.requesterName?.trim() || prior?.requesterName,
    consultantCurrency: dto.consultantCurrency
      ? ({ GBP: "£", USD: "$", EUR: "€" } as const)[dto.consultantCurrency]
      : prior?.consultantCurrency,
    consultantPrice: dto.consultantPrice ?? prior?.consultantPrice,
    priceAmount: dto.priceAmount ?? prior?.priceAmount,
    priceCurrency: dto.priceCurrency ?? prior?.priceCurrency,
    paymentStatus: dto.paymentStatus ?? prior?.paymentStatus,
  };
}

/** Merge a list of server bookings into the local store. Server is
 *  authoritative — for any matching id, the server version replaces the
 *  local one. New ones are appended. */
function mergeBookings(serverList: Booking[]) {
  const state = useBookingsStore.getState();
  const localById = new Map(state.bookings.map((b) => [b.id, b]));
  for (const sb of serverList) localById.set(sb.id, sb);
  useBookingsStore.setState({ bookings: Array.from(localById.values()) });
}

/** Pull the consultant inbox from the server and merge. */
export async function pullInbox(): Promise<void> {
  const profile = useConsultantStore.getState().profile;
  if (!profile) return;
  const res = await getInbox();
  if (!res.ok) return; // soft-fail
  const priorById = new Map(useBookingsStore.getState().bookings.map((b) => [b.id, b]));
  const list = res.data.bookings.map((dto) =>
    dtoToBooking(dto, profile.initials, priorById.get(dto.id)),
  );
  mergeBookings(list);
}

/** Pull the HR-side bookings list from the server and merge. Returns false on a
 *  fetch failure so callers can distinguish "genuinely no bookings" from "the
 *  request failed" and avoid rendering a false empty state. */
export async function pullMyBookings(): Promise<boolean> {
  const res = await listMyBookings();
  if (!res.ok) return false;
  // We don't know the consultant's initials from this response, so use
  // a placeholder. The marketplace listing fills the real initials when
  // the consultant card is rendered alongside.
  const priorById = new Map(useBookingsStore.getState().bookings.map((b) => [b.id, b]));
  const list = res.data.bookings.map((dto) =>
    // Prefer the real initials from the server join; fall back to a
    // UUID-slice only if the join returned nothing. Pass the prior local row
    // so localDraftId (readable id for "Open draft") survives the hydrate.
    dtoToBooking(
      dto,
      dto.consultantInitials ?? (dto.consultantProfileId ?? "").slice(0, 2).toUpperCase(),
      priorById.get(dto.id),
    ),
  );
  mergeBookings(list);
  return true;
}

/** Mirror a fresh booking to the server, then swap the local placeholder
 *  row out for the server's canonical record. Without this swap, the UI
 *  would show two bookings — one with the local placeholder id, one
 *  with the server UUID after the next pullMyBookings hydrate.
 *
 *  Pass `localPlaceholderId` so we can remove the optimistic local row
 *  on success. Soft-fails: on network error the local copy is kept (the
 *  user's booking isn't lost, just not yet replicated).
 */
export async function pushBookingCreate(
  input: {
    consultantProfileId: string;
    draftId?: string | null;
    matterTitle?: string;
    message?: string;
    expectedDeliveryAt?: string;
  },
  localPlaceholderId: string,
  consultantInitials: string,
): Promise<boolean> {
  // Snapshot the optimistic local row BEFORE the await — it holds the readable
  // draftId we must preserve as localDraftId so "Open draft" works. A concurrent
  // pullMyBookings()/pullInbox() during createBooking() can replace the bookings
  // array and drop the not-yet-server-known placeholder; without this snapshot
  // the placeholder lookup below would miss and localDraftId would be lost.
  const placeholderBefore = useBookingsStore
    .getState()
    .bookings.find((b) => b.id === localPlaceholderId);
  const res = await createBooking(input);
  if (!res.ok) {
    // The POST failed and there is NO retry path — the consultant's inbox is
    // server-driven, so this request would never reach them. Roll back the
    // optimistic local row (otherwise the HR user keeps a phantom "Awaiting
    // response" booking forever) and signal failure so the caller can surface
    // an error instead of a false "Booking confirmed".
    const st = useBookingsStore.getState();
    useBookingsStore.setState({
      bookings: st.bookings.filter((b) => b.id !== localPlaceholderId),
    });
    return false;
  }
  const state = useBookingsStore.getState();
  const placeholder =
    state.bookings.find((b) => b.id === localPlaceholderId) ?? placeholderBefore;
  const serverBooking = dtoToBooking(res.data.booking, consultantInitials, placeholder);
  useBookingsStore.setState({
    bookings: [
      ...state.bookings.filter((b) => b.id !== localPlaceholderId),
      serverBooking,
    ],
  });
  return true;
}

/** Append a message to a booking's thread on the server. The server
 *  derives 'from' from the caller's role on the booking, so the role
 *  hint we pass is ignored; we only use it for the optimistic local
 *  update before the server response arrives. */
export async function pushBookingMessage(
  bookingId: string,
  from: "requester" | "consultant",
  text: string,
  opts?: {
    /** No toast on failure: the caller delivers the same words another way
     *  (a review link) or tells the person itself. */
    quiet?: boolean;
  },
): Promise<boolean> {
  // Nothing to send: not a failure worth telling anyone about (the server
  // would answer 400 and the person would see a false "didn't send").
  if (!text.trim()) return false;
  const res = await sendBookingMessage(bookingId, text);
  if (!res.ok) {
    // Don't silently leave the optimistic bubble looking "delivered" while
    // the server thread never received it — the counterpart only sees the
    // SERVER thread and would never get this message (the B9/R19 silent-lie
    // class, mirrored from pushBookingRespond). Tell the sender and re-pull
    // both sides' threads so the local state reconciles to the server truth.
    if (!opts?.quiet) toast.error("Message didn't send. Check your connection and try again.");
    void pullInbox();
    void pullMyBookings();
    return false;
  }
  // Server returns the full messages array — replace local with that
  // so any messages from the other party that were missing also land.
  const state = useBookingsStore.getState();
  useBookingsStore.setState({
    bookings: state.bookings.map((b) =>
      b.id === bookingId ? { ...b, messages: res.data.messages } : b,
    ),
  });
  // Tip 'from' is unused at this point — the server-truth wins — but
  // we accept the param so callers don't need to know.
  void from;
  return true;
}

/** Mirror a booking state transition to the server. When the server
 *  returns an updated booking (e.g. with a freshly-minted share token
 *  on accept), merge those fields back into the local store so the UI
 *  can use the token immediately. */
export async function pushBookingRespond(
  bookingId: string,
  action: "accept" | "decline" | "deliver" | "complete",
  opts?: { note?: string; rating?: number },
): Promise<boolean> {
  const res = await respondToBooking(bookingId, action, opts);
  if (!res.ok) {
    // Don't silently leave the optimistic local row ahead of the server
    // (B9). Tell the user and re-pull so the local state reconciles to the
    // server's authoritative status. A 409 means someone else already moved
    // this booking; other codes are a transient failure.
    toast.error(
      res.status === 409
        ? "This booking already changed. Refreshing its status."
        : "Couldn't update the booking. Refreshing its status.",
    );
    void pullInbox();
    void pullMyBookings();
    return false;
  }
  const state = useBookingsStore.getState();
  const local = state.bookings.find((b) => b.id === bookingId);
  const merged = dtoToBooking(
    res.data.booking,
    local?.consultantInitials ??
      (res.data.booking.consultantProfileId ?? "").slice(0, 2).toUpperCase(),
    local,
  );
  useBookingsStore.setState({
    bookings: state.bookings.map((b) => (b.id === bookingId ? merged : b)),
  });
  return true;
}
