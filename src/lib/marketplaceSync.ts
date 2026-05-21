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
import {
  getConsultantProfile,
  saveConsultantProfile,
  createBooking,
  getInbox,
  listMyBookings,
  respondToBooking,
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
    currency: symbolByCode[dto.currency],
    sla: dto.sla,
    rating: dto.rating,
    reviews: dto.reviews,
    avatarFrom: "#f3dca5",
    avatarTo: "#e9b75c",
    photoUrl: dto.photoUrl ?? "",
    availability: "this_week" as Availability, // server has no field yet
    payout: { stripeAccountId: null, payoutsEnabled: false },
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
 *  from the symbol form the local store keeps. */
export async function pushProfile(): Promise<void> {
  const p = useConsultantStore.getState().profile;
  if (!p) return;
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
    photoUrl: p.photoUrl || null,
  });
  if (!res.ok) {
    useConsultantStore.getState().setSync("local", res.error);
    return;
  }
  useConsultantStore.getState().hydrateFromServer(dtoToProfile(res.data.profile));
}

// ─── Bookings ────────────────────────────────────────────────────────

/** Map server booking DTO into the local Booking shape. The local model
 *  keys bookings by consultantInitials (we don't have the consultant's
 *  user id in the inbox response), so we use the dto id as the booking id
 *  and the consultantProfileId stub as initials when there's no profile
 *  data attached. */
function dtoToBooking(dto: BookingDTO, consultantInitials: string): Booking {
  return {
    id: dto.id,
    consultantInitials,
    draftId: dto.draftId ?? "",
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
  const list = res.data.bookings.map((dto) => dtoToBooking(dto, profile.initials));
  mergeBookings(list);
}

/** Pull the HR-side bookings list from the server and merge. */
export async function pullMyBookings(): Promise<void> {
  const res = await listMyBookings();
  if (!res.ok) return;
  // We don't know the consultant's initials from this response, so use
  // a placeholder. The marketplace listing fills the real initials when
  // the consultant card is rendered alongside.
  const list = res.data.bookings.map((dto) => dtoToBooking(dto, dto.consultantProfileId.slice(0, 2).toUpperCase()));
  mergeBookings(list);
}

/** Mirror a fresh booking to the server. Called from BookingDialog after
 *  recordBooking has put the row in localStorage. */
export async function pushBookingCreate(input: {
  consultantProfileId: string;
  draftId?: string | null;
  matterTitle?: string;
  message?: string;
  expectedDeliveryAt?: string;
}): Promise<void> {
  await createBooking(input); // soft-fail; local copy already exists
}

/** Mirror a booking state transition to the server. */
export async function pushBookingRespond(
  bookingId: string,
  action: "accept" | "decline" | "deliver" | "complete",
  opts?: { note?: string; rating?: number },
): Promise<void> {
  await respondToBooking(bookingId, action, opts); // soft-fail
}
