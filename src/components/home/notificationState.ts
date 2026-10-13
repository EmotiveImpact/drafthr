/**
 * What each person has done with their notifications, kept on this device:
 * which items they have read, which they snoozed (until when), when each
 * item first appeared (for items with no event time), and which kinds they
 * switched off in Notification settings. Keyed per person (email, else
 * name) so two people on one browser do not share read state.
 */
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useDraftStore } from "@/lib/store";
import { useProfileStore } from "@/lib/profile";
import { useReviewStore } from "@/lib/journey/reviews";
import { buildFeed, groupFeed, type FeedCategory, type FeedItem } from "./notificationFeed";

type PersonState = {
  read: Record<string, number>;
  snoozed: Record<string, number>;
  firstSeen: Record<string, number>;
  muted: Partial<Record<FeedCategory, boolean>>;
};

type Store = {
  people: Record<string, PersonState>;
  markRead: (who: string, ids: string[]) => void;
  snooze: (who: string, id: string, until: number) => void;
  noteSeen: (who: string, ids: string[], at: number) => void;
  setMuted: (who: string, category: FeedCategory, muted: boolean) => void;
};

const EMPTY: PersonState = { read: {}, snoozed: {}, firstSeen: {}, muted: {} };

const patch = (s: Store, who: string, fn: (p: PersonState) => PersonState) => ({
  people: { ...s.people, [who]: fn(s.people[who] ?? EMPTY) },
});

export const useNotificationState = create<Store>()(
  persist(
    (set) => ({
      people: {},
      markRead: (who, ids) =>
        set((s) =>
          patch(s, who, (p) => {
            const read = { ...p.read };
            const now = Date.now();
            for (const id of ids) read[id] = now;
            return { ...p, read };
          })
        ),
      snooze: (who, id, until) => set((s) => patch(s, who, (p) => ({ ...p, snoozed: { ...p.snoozed, [id]: until } }))),
      noteSeen: (who, ids, at) =>
        set((s) => {
          const p = s.people[who] ?? EMPTY;
          const fresh = ids.filter((id) => p.firstSeen[id] == null);
          if (fresh.length === 0) return s;
          const firstSeen = { ...p.firstSeen };
          for (const id of fresh) firstSeen[id] = at;
          return patch(s, who, (q) => ({ ...q, firstSeen }));
        }),
      setMuted: (who, category, muted) =>
        set((s) => patch(s, who, (p) => ({ ...p, muted: { ...p.muted, [category]: muted } }))),
    }),
    {
      name: "drafthr.notifications.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export type ShownItem = FeedItem & { time: number; unread: boolean };

/** The person's key for read state. */
export function usePersonKey(): string {
  const personal = useProfileStore((s) => s.profile.personal);
  return (personal.email || personal.legalName || personal.preferredName || "me").trim().toLowerCase();
}

/**
 * The live feed for the signed-in person: the role's letters, minus
 * switched-off kinds and snoozed items, each with its time and read state.
 */
export function useNotifications() {
  const drafts = useDraftStore((s) => s.drafts);
  const matters = useDraftStore((s) => s.matters);
  const profile = useProfileStore((s) => s.profile);
  const reviews = useReviewStore((s) => s.requests);
  const who = usePersonKey();
  const person = useNotificationState((s) => s.people[who]) ?? EMPTY;
  const noteSeen = useNotificationState((s) => s.noteSeen);

  const feed = useMemo(() => {
    const role = profile.role;
    const letters = Object.values(drafts).filter((d) => !d.isTemplateSource && (!role || d.mode === role));
    return buildFeed({ drafts: letters, matters, profile, reviews });
  }, [drafts, matters, profile, reviews]);

  // Remember when each item first showed up (deadline items have no time of their own).
  useEffect(() => {
    noteSeen(
      who,
      feed.filter((f) => f.at == null).map((f) => f.id),
      Date.now()
    );
  }, [feed, who, noteSeen]);

  return useMemo(() => {
    const now = Date.now();
    const items: ShownItem[] = feed
      .filter((f) => !person.muted[f.category])
      .filter((f) => !(person.snoozed[f.id] && person.snoozed[f.id] > now))
      .map((f) => {
        const time = f.at ?? person.firstSeen[f.id] ?? now;
        const readAt = person.read[f.id];
        return { ...f, time, unread: readAt == null || readAt < time };
      });
    const counts = {
      all: items.length,
      urgent: items.filter((i) => i.severity === "urgent").length,
      warn: items.filter((i) => i.severity === "warn").length,
      info: items.filter((i) => i.severity === "info").length,
    };
    const unreadNeedYou = items.filter((i) => i.unread && i.severity !== "info").length;
    const unreadAny = items.filter((i) => i.unread).length;
    return { items, counts, unreadNeedYou, unreadAny, muted: person.muted, who, groups: (list: ShownItem[]) => groupFeed(list, now) };
  }, [feed, person, who]);
}
