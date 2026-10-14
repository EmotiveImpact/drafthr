import type { AvailabilityCode } from "@/lib/consultantApi";

/**
 * Shared marketplace consultant card shape.
 *
 * Every Consultant rendered in the app is REAL: either a published profile from
 * the marketplace API (`profileId` set) or the signed-in consultant's own
 * in-progress card. There is no hardcoded/seed data — an empty marketplace
 * shows an honest empty state, not fabricated specialists.
 */
export type Consultant = {
  /** Server-side profile id (UUID). Present for every live marketplace card. */
  profileId?: string;
  initials: string;
  name: string;
  role: string;
  rating: number;
  reviews: number;
  price: number;
  /** Priority price (back within 24 hours of payment), above price. Null or
   *  absent when the expert doesn't offer it or priority is switched off. */
  priorityPrice?: number | null;
  /** Display currency symbol. */
  currency?: "£" | "$" | "€";
  sla: string;
  top?: boolean;
  /** Tailwind gradient classes for the avatar fallback (legacy, unused by the card). */
  avatarFrom: string;
  avatarTo: string;
  /** Profile photo URL. */
  photoUrl: string;
  /** Specialty headline written by the expert. */
  specialty: string;
  /** Tag list driving filter chips on the marketplace index. */
  specialties: string[];
  /** The expert's own bio (profile sheet "About"). */
  bio?: string;
  /** Availability code from the profile. Undefined when the server sent none. */
  availability?: AvailabilityCode;
  /**
   * True for the signed-in consultant's OWN card when their profile is not yet
   * published (pending_review / rejected / paused). Such a card is injected so
   * they can preview it, but it must NOT claim to be "Live" — no HR user can
   * discover it. Undefined for published cards.
   */
  pending?: boolean;
};
