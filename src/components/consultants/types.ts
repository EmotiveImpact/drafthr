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
  /** Display currency symbol. */
  currency?: "£" | "$" | "€";
  sla: string;
  top?: boolean;
  /** Tailwind gradient classes for the avatar fallback. */
  avatarFrom: string;
  avatarTo: string;
  /** Profile photo URL. */
  photoUrl: string;
  /** Short marketing quote shown in the card specialty box. */
  specialty: string;
  /** Tag list driving filter chips on the marketplace index. */
  specialties: string[];
};
