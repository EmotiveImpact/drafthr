import { UserPlus } from "lucide-react";
import type { Draft } from "@/lib/letters/types";
import type { Profile } from "@/lib/profile";
import { AvatarStack } from "@/components/ds";
import { listIdentities } from "@/lib/comments/identity";

/**
 * 12B presence row: the people who have access to this letter, as a quiet
 * pill floating over the top of the page. DraftHR has no live presence, so
 * this lists access (you plus the letter's collaborators), never cursors or
 * "viewing now". Clicking it opens the Share popover.
 */
export function PresenceBar({
  draft,
  profile,
  onManage,
}: {
  draft: Draft;
  profile: Profile;
  onManage: () => void;
}) {
  const identities = listIdentities(draft, profile);
  const others = identities.filter((i) => i.id !== "me");
  const names = others.map((i) => i.name || i.email || "Someone");

  let label: React.ReactNode;
  if (names.length === 0) {
    label = <>Only you have access</>;
  } else if (names.length === 1) {
    label = (
      <>
        <b className="font-medium text-[var(--ds-ink)]">{names[0]}</b> and you have access
      </>
    );
  } else if (names.length === 2) {
    label = (
      <>
        <b className="font-medium text-[var(--ds-ink)]">{names[0]}</b> and{" "}
        <b className="font-medium text-[var(--ds-ink)]">{names[1]}</b> have access
      </>
    );
  } else {
    label = (
      <>
        <b className="font-medium text-[var(--ds-ink)]">{names[0]}</b> and {names.length - 1} others have access
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={onManage}
      className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-[var(--ds-line)] bg-[var(--ds-surface)] py-1 pl-1 pr-3 text-[12.5px] text-[var(--ds-muted)] shadow-[var(--ds-shadow-s)] transition hover:border-[var(--ds-line-strong)]"
      aria-label="People on this letter. Click to manage or invite."
      title="Manage people"
    >
      {others.length > 0 ? (
        <AvatarStack
          size="md"
          max={3}
          people={others.map((i) => ({
            seed: i.email ?? i.id,
            email: i.email,
            name: i.name,
            initials: i.initials,
            title: i.name + (i.email ? ` <${i.email}>` : ""),
          }))}
        />
      ) : (
        <span className="grid size-5 place-items-center rounded-full bg-[var(--ds-surface-2)] text-[var(--ds-muted)]" aria-hidden>
          <UserPlus className="size-3" />
        </span>
      )}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
