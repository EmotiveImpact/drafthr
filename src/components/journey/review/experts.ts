/**
 * Marketplace experts for the review dialog's expert pane: the live
 * listing (no seed data; an empty marketplace is an honest empty state),
 * the experts who fit this letter, ranked, and the price wording.
 */
import { useEffect, useMemo, useState } from "react";
import type { Draft } from "@/lib/letters/types";
import { listMarketplace, type MarketplaceConsultantDTO } from "@/lib/consultantApi";
import { initialsOf } from "@/components/consultants/ui";
import { specialtiesFor } from "./model";

export type Expert = {
  id: string;
  name: string;
  initials: string;
  /** Credentials line ("Chartered MCIPD · Former ACAS adviser"). */
  cred: string;
  rating: number;
  reviews: number;
  /** Rate in whole currency units, as listed. */
  price: number;
  symbol: "£" | "$" | "€";
  sla: string;
  photoUrl: string | null;
  specialties: string[];
  availability?: string;
};

const SYMBOL: Record<string, Expert["symbol"]> = { GBP: "£", USD: "$", EUR: "€" };

function toExpert(d: MarketplaceConsultantDTO): Expert {
  return {
    id: d.id,
    name: d.fullName,
    initials: d.initials || initialsOf(d.fullName),
    cred: d.role,
    rating: Number(d.rating) || 0,
    reviews: Number(d.reviews) || 0,
    price: Number(d.price) || 0,
    symbol: SYMBOL[d.currency] ?? "£",
    sla: d.sla || "48h",
    photoUrl: d.photoUrl,
    specialties: d.specialties ?? [],
    availability: d.availability,
  };
}

let cache: { at: number; experts: Expert[] } | null = null;

export type ExpertsState = {
  status: "loading" | "ready" | "failed";
  /** Every listed expert (for finding the one chosen in the marketplace). */
  all: Expert[];
  /** Experts who fit this letter, best first. */
  matching: Expert[];
};

/** Lowest listed price, for "From £95, paid when they accept". */
export function lowestPrice(experts: Expert[]): Expert | null {
  return experts.reduce<Expert | null>((lo, e) => (e.price > 0 && (!lo || e.price < lo.price) ? e : lo), null);
}

export function rankForLetter(experts: Expert[], draft: Draft | undefined): Expert[] {
  const wanted = draft ? specialtiesFor(draft).map((s) => s.toLowerCase()) : [];
  const fits = (e: Expert) => e.specialties.filter((s) => wanted.includes(s.toLowerCase())).length;
  const pool = wanted.length ? experts.filter((e) => fits(e) > 0) : experts.slice();
  return pool.sort(
      (a, b) =>
        Number(a.availability === "booked") - Number(b.availability === "booked") ||
        fits(b) - fits(a) ||
        b.rating - a.rating ||
        b.reviews - a.reviews ||
        a.price - b.price
    );
}

/** The live marketplace, fetched once per minute at most. */
export function useExperts(draft: Draft | undefined, enabled: boolean): ExpertsState {
  const [state, setState] = useState<{ status: ExpertsState["status"]; all: Expert[] }>(() =>
    cache && Date.now() - cache.at < 60000 ? { status: "ready", all: cache.experts } : { status: "loading", all: [] }
  );
  useEffect(() => {
    if (!enabled) return;
    if (cache && Date.now() - cache.at < 60000) {
      setState({ status: "ready", all: cache.experts });
      return;
    }
    let cancelled = false;
    void listMarketplace({ limit: 200 }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setState({ status: "failed", all: [] });
        return;
      }
      const experts = (res.data.consultants ?? []).map(toExpert);
      cache = { at: Date.now(), experts };
      setState({ status: "ready", all: experts });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const matching = useMemo(() => rankForLetter(state.all, draft), [state.all, draft]);
  return { status: state.status, all: state.all, matching };
}

/** Test seam. */
export function __resetExpertsCache(): void {
  cache = null;
}
