/** Server-authoritative marketplace transport. Stores are memory caches, not
 * an offline database. No business mutation appears saved before acceptance. */
import { toast } from "sonner";
import {
  getConsultantProfile, saveConsultantProfile, createBooking, getInbox,
  listMyBookings, respondToBooking, sendBookingMessage,
  type ApiResult, type ConsultantProfileDTO, type BookingDTO,
} from "@/lib/consultantApi";
import { useConsultantStore, type ConsultantProfile } from "@/lib/consultantProfile";
import { useBookingsStore, type Booking } from "@/lib/bookings";
import {
  captureMarketplaceScope, isMarketplaceIdentityCurrent, isMarketplaceScopeCurrent,
  recoverMarketplaceScope, type MarketplaceScope,
} from "./marketplace-scope";

const symbolByCode = { GBP: "£", USD: "$", EUR: "€" } as const;
const codeByCurrency = { "£": "GBP", "$": "USD", "€": "EUR" } as const;
let profileRead = 0, requesterRead = 0, inboxRead = 0;
const mutations = new Set<string>();
const RECOVERY_ERROR = "The session changed while loading. Retry to refresh the confirmed server state.";

/** Per-resource lock prevents duplicate clicks and response-order races.
 * Identity generations ensure an old request cannot hold a new account's lock. */
function beginMutation(resource: string) {
  const scope = captureMarketplaceScope();
  if (!scope) return null;
  // A cancelled transition must not let a second write overtake the first one
  // for this identity. Only a genuine identity generation gets a new lock.
  const key = `${scope.generation}:${resource}`;
  if (mutations.has(key)) return null;
  mutations.add(key);
  return { scope, release: () => mutations.delete(key) };
}

/** Discard pre-transition replies even when the identity is unchanged. One
 * fresh read can recover a failed transition; repeated transitions stay
 * retryable instead of creating an unbounded request loop. */
async function readWithTransitionRecovery<T>(
  scope: MarketplaceScope,
  read: () => Promise<ApiResult<T>>,
  isLatest: () => boolean,
): Promise<{ response: ApiResult<T>; scope: MarketplaceScope } | null> {
  const response = await read();
  if (!isLatest()) return null;
  if (isMarketplaceScopeCurrent(scope)) return { response, scope };
  const recovered = await recoverMarketplaceScope(scope);
  if (!recovered || !isLatest() || !isMarketplaceScopeCurrent(recovered)) return null;
  const refreshed = await read();
  return isLatest() && isMarketplaceScopeCurrent(recovered) ? { response: refreshed, scope: recovered } : null;
}

/** Never replay a mutation with an ambiguous outcome. Reconcile via a new GET
 * only if the original account/workspace still owns this mounted state. */
async function reconcileCancelledMutation(scope: MarketplaceScope, refresh: () => Promise<unknown>) {
  const recovered = await recoverMarketplaceScope(scope);
  if (recovered && isMarketplaceScopeCurrent(recovered)) await refresh();
}

function dtoToProfile(dto: ConsultantProfileDTO): ConsultantProfile {
  return {
    ...dto,
    specialties: dto.specialties ?? [],
    currency: symbolByCode[dto.currency] ?? "£",
    avatarFrom: "#f3dca5",
    avatarTo: "#e9b75c",
    photoUrl: dto.photoUrl ?? "",
    availability: dto.availability ?? "this_week",
    // PayoutConnect reads the real provider status separately. Never preserve
    // a previous account's locally-set claim that payouts are enabled.
    payout: { stripeAccountId: null, payoutsEnabled: false },
    updatedAt: dto.updatedAt ?? null,
  };
}

export async function pullProfile(): Promise<boolean> {
  const scope = captureMarketplaceScope();
  if (!scope) return false;
  const request = ++profileRead;
  useConsultantStore.getState().setSync("pending");
  const read = await readWithTransitionRecovery(scope, getConsultantProfile, () => request === profileRead);
  if (!read || !isMarketplaceScopeCurrent(read.scope) || request !== profileRead) {
    if (isMarketplaceIdentityCurrent(scope) && request === profileRead) {
      useConsultantStore.getState().setSync("error", RECOVERY_ERROR);
    }
    return false;
  }
  const res = read.response;
  if (!res.ok) {
    useConsultantStore.getState().setSync("error", res.error);
    return false;
  }
  useConsultantStore.getState().hydrateFromServer(res.data.profile ? dtoToProfile(res.data.profile) : null);
  return true;
}

export type ProfileChanges = Pick<ConsultantProfile,
  "fullName" | "role" | "bio" | "specialty" | "specialties" | "price" | "currency" | "sla" | "availability" | "photoUrl">;

/** Save form values without modifying the accepted profile first. A true
 * return means saved, not published: moderation status comes from the API. */
export async function pushProfile(input: ProfileChanges): Promise<boolean> {
  const operation = beginMutation("profile");
  if (!operation) return false;
  const request = ++profileRead;
  useConsultantStore.getState().setSync("pending");
  try {
    const res = await saveConsultantProfile({ ...input, currency: codeByCurrency[input.currency], photoUrl: input.photoUrl || null });
    if (!isMarketplaceScopeCurrent(operation.scope)) {
      await reconcileCancelledMutation(operation.scope, pullProfile);
      if (isMarketplaceIdentityCurrent(operation.scope) && request === profileRead) {
        useConsultantStore.getState().setSync("error", RECOVERY_ERROR);
      }
      return false;
    }
    ++profileRead; // a read begun while saving cannot restore the older row
    if (!res.ok) {
      useConsultantStore.getState().setSync("error", res.error);
      return false;
    }
    useConsultantStore.getState().hydrateFromServer(dtoToProfile(res.data.profile));
    return true;
  } finally { operation.release(); }
}

function dtoToBooking(dto: BookingDTO, initials: string, prior?: Booking): Booking {
  return {
    id: dto.id,
    consultantInitials: initials,
    consultantProfileId: dto.consultantProfileId,
    draftId: dto.draftId ?? "",
    localDraftId: prior?.localDraftId,
    matterTitle: dto.matterTitle ?? undefined,
    message: dto.message ?? undefined,
    responseNote: dto.responseNote ?? undefined,
    deliveryNote: dto.deliveryNote ?? undefined,
    rating: dto.rating ?? undefined,
    bookedAt: dto.bookedAt,
    acceptedAt: dto.acceptedAt ?? undefined,
    deliveredAt: dto.deliveredAt ?? undefined,
    completedAt: dto.completedAt ?? undefined,
    expectedDeliveryAt: dto.expectedDeliveryAt === null ? 0 : dto.expectedDeliveryAt ?? prior?.expectedDeliveryAt ?? 0,
    status: dto.status,
    shareToken: dto.shareToken ?? undefined,
    shareTokenExpiresAt: dto.shareTokenExpiresAt ?? undefined,
    messages: dto.messages ?? [],
    // Mutations omit the list-only join fields. Explicit null clears a field;
    // omission preserves the previously accepted display value.
    consultantName: dto.consultantName === null ? undefined : dto.consultantName ?? prior?.consultantName,
    consultantRole: dto.consultantRole === null ? undefined : dto.consultantRole ?? prior?.consultantRole,
    consultantPhotoUrl: dto.consultantPhotoUrl === null ? undefined : dto.consultantPhotoUrl ?? prior?.consultantPhotoUrl,
    consultantCurrency: dto.consultantCurrency === null ? undefined : dto.consultantCurrency ? symbolByCode[dto.consultantCurrency] : prior?.consultantCurrency,
    consultantPrice: dto.consultantPrice === null ? undefined : dto.consultantPrice ?? prior?.consultantPrice,
  };
}

export async function pullInbox(): Promise<boolean> {
  const scope = captureMarketplaceScope();
  if (!scope) return false;
  const request = ++inboxRead;
  useBookingsStore.setState({ inboxState: "loading" });
  const read = await readWithTransitionRecovery(scope, getInbox, () => request === inboxRead);
  if (!read || !isMarketplaceScopeCurrent(read.scope) || request !== inboxRead) {
    if (isMarketplaceIdentityCurrent(scope) && request === inboxRead) {
      useBookingsStore.setState({ inboxState: "error" });
    }
    return false;
  }
  const res = read.response;
  if (!res.ok) {
    useBookingsStore.setState(res.status === 412 ? { inbox: [], inboxState: "ready" } : { inboxState: "error" });
    return res.status === 412;
  }
  const priorById = new Map(useBookingsStore.getState().inbox.map((b) => [b.id, b]));
  const initials = useConsultantStore.getState().profile?.initials ?? "";
  useBookingsStore.setState({
    inbox: res.data.bookings.map((dto) => dtoToBooking(dto, initials, priorById.get(dto.id))),
    inboxState: "ready",
  });
  return true;
}

export async function pullMyBookings(): Promise<boolean> {
  const scope = captureMarketplaceScope();
  if (!scope) return false;
  const request = ++requesterRead;
  const read = await readWithTransitionRecovery(scope, listMyBookings, () => request === requesterRead);
  if (!read || !isMarketplaceScopeCurrent(read.scope) || request !== requesterRead || !read.response.ok) return false;
  const res = read.response;
  const priorById = new Map(useBookingsStore.getState().bookings.map((b) => [b.id, b]));
  // Replace the complete snapshot. Merging kept withdrawn/deleted rows forever.
  useBookingsStore.setState({ bookings: res.data.bookings.map((dto) => dtoToBooking(
    dto, dto.consultantInitials ?? "", priorById.get(dto.id),
  )) });
  return true;
}

export async function pushBookingCreate(
  input: Parameters<typeof createBooking>[0],
  consultantInitials: string,
  localDraftId?: string,
): Promise<Booking | null> {
  const operation = beginMutation("booking-create");
  if (!operation) return null;
  try {
    const res = await createBooking(input);
    if (!isMarketplaceScopeCurrent(operation.scope)) {
      await reconcileCancelledMutation(operation.scope, pullMyBookings);
      return null;
    }
    if (!res.ok) return null;
    ++requesterRead;
    const booking = { ...dtoToBooking(res.data.booking, consultantInitials), localDraftId };
    useBookingsStore.setState((state) => ({ bookings: [
      ...state.bookings.filter((b) => b.id !== booking.id), booking,
    ] }));
    return booking;
  } finally { operation.release(); }
}

function updateAcceptedBooking(bookingId: string, update: (booking: Booking) => Booking) {
  ++requesterRead; ++inboxRead;
  useBookingsStore.setState((state) => ({
    bookings: state.bookings.map((b) => b.id === bookingId ? update(b) : b),
    inbox: state.inbox.map((b) => b.id === bookingId ? update(b) : b),
    inboxState: state.inboxState === "loading" ? "ready" : state.inboxState,
  }));
}

async function refreshBookingCaches() {
  await Promise.all([pullMyBookings(), pullInbox()]);
}

export async function pushBookingMessage(
  bookingId: string, _from: "requester" | "consultant", text: string, messageId?: string,
): Promise<boolean> {
  if (!text.trim()) return false;
  const operation = beginMutation(`booking:${bookingId}`);
  if (!operation) return false;
  try {
    const res = await sendBookingMessage(bookingId, text.trim(), messageId);
    if (!isMarketplaceScopeCurrent(operation.scope)) {
      await reconcileCancelledMutation(operation.scope, refreshBookingCaches);
      return false;
    }
    if (!res.ok) {
      toast.error("Message wasn't confirmed — check the thread before retrying.");
      return false;
    }
    updateAcceptedBooking(bookingId, (b) => ({ ...b, messages: res.data.messages }));
    return true;
  } finally { operation.release(); }
}

export async function pushBookingRespond(
  bookingId: string,
  action: "accept" | "decline" | "deliver" | "complete",
  opts?: { note?: string; rating?: number },
): Promise<boolean> {
  const operation = beginMutation(`booking:${bookingId}`);
  if (!operation) return false;
  try {
    const res = await respondToBooking(bookingId, action, opts);
    if (!isMarketplaceScopeCurrent(operation.scope)) {
      await reconcileCancelledMutation(operation.scope, refreshBookingCaches);
      return false;
    }
    if (!res.ok) {
      toast.error(res.status === 409 ? "This booking already changed — refresh its status." : "Update wasn't confirmed — refresh before retrying.");
      return false;
    }
    updateAcceptedBooking(bookingId, (b) => dtoToBooking(res.data.booking, b.consultantInitials, b));
    return true;
  } finally { operation.release(); }
}
