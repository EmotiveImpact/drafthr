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
    specialties: dto.specialties,
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
    expectedDeliveryAt: dto.expectedDeliveryAt ?? Date.now() + 24 * 60 * 60 * 1000,
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
    consultantCurrency: dto.consultantCurrency
      ? ({ GBP: "£", USD: "$", EUR: "€" } as const)[dto.consultantCurrency]
      : prior?.consultantCurrency,
    consultantPrice: dto.consultantPrice ?? prior?.consultantPrice,
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

/** Pull the HR-side bookings list from the server and merge. */
export async function pullMyBookings(): Promise<void> {
  const res = await listMyBookings();
  if (!res.ok) return;
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
): Promise<void> {
  const res = await createBooking(input);
  if (!res.ok) return; // keep local placeholder
  const state = useBookingsStore.getState();
  // Capture the optimistic local row BEFORE filtering it out — it holds the
  // readable draftId we must preserve as localDraftId so "Open draft" works.
  const placeholder = state.bookings.find((b) => b.id === localPlaceholderId);
  const serverBooking = dtoToBooking(res.data.booking, consultantInitials, placeholder);
  useBookingsStore.setState({
    bookings: [
      ...state.bookings.filter((b) => b.id !== localPlaceholderId),
      serverBooking,
    ],
  });
}

/** Append a message to a booking's thread on the server. The server
 *  derives 'from' from the caller's role on the booking, so the role
 *  hint we pass is ignored; we only use it for the optimistic local
 *  update before the server response arrives. */
export async function pushBookingMessage(
  bookingId: string,
  from: "requester" | "consultant",
  text: string,
): Promise<void> {
  const res = await sendBookingMessage(bookingId, text);
  if (!res.ok) return;
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
}

/** Mirror a booking state transition to the server. When the server
 *  returns an updated booking (e.g. with a freshly-minted share token
 *  on accept), merge those fields back into the local store so the UI
 *  can use the token immediately. */
export async function pushBookingRespond(
  bookingId: string,
  action: "accept" | "decline" | "deliver" | "complete",
  opts?: { note?: string; rating?: number },
): Promise<void> {
  const res = await respondToBooking(bookingId, action, opts);
  if (!res.ok) {
    // Don't silently leave the optimistic local row ahead of the server
    // (B9). Tell the user and re-pull so the local state reconciles to the
    // server's authoritative status. A 409 means someone else already moved
    // this booking; other codes are a transient failure.
    toast.error(
      res.status === 409
        ? "This booking already changed — refreshing."
        : "Couldn't update the booking. Refreshing its status.",
    );
    void pullInbox();
    void pullMyBookings();
    return;
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
}
