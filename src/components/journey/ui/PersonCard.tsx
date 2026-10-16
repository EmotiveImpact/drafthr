import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ds/Avatar";
import { Pill, type PillTone } from "@/components/ds/Pill";

/**
 * A person on the letter: the reviewer (f3, f5) or the approver (f6). Avatar,
 * name, role, a status pill on the right, and an optional timeline (done
 * steps green, the live one lilac with a soft halo, the rest grey). Extra
 * content (verdict, quote, buttons) goes in children.
 */
export type PersonTimelineItem = {
  id: string;
  label: ReactNode;
  /** "09:24", "now", "by Thu 12:00". */
  time?: string;
  state: "done" | "now" | "todo";
};

export function PersonCard({
  name,
  role,
  seed,
  initials,
  pill,
  timeline,
  children,
  className,
}: {
  name: string;
  role?: ReactNode;
  seed?: string;
  initials?: string;
  /** A status pill on the right ({ tone, label }) or any node. */
  pill?: { tone: PillTone; label: string } | ReactNode;
  timeline?: PersonTimelineItem[];
  children?: ReactNode;
  className?: string;
}) {
  const pillNode: ReactNode = isPillSpec(pill) ? (
    <Pill tone={pill.tone} dot={false} className="ml-auto">
      {pill.label}
    </Pill>
  ) : (
    (pill as ReactNode) ?? null
  );
  return (
    <section
      data-slot="person-card"
      className={cn("rounded-[14px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-4 py-3.5", className)}
    >
      <div className="flex items-center gap-2.5">
        <Avatar size="2xl" name={name} seed={seed ?? name} initials={initials} />
        <div className="min-w-0">
          <b className="block truncate text-[14px] font-medium text-[var(--ds-ink)]">{name}</b>
          {role && <span className="block truncate text-[12px] text-[var(--ds-muted)]">{role}</span>}
        </div>
        {pillNode}
      </div>
      {timeline && timeline.length > 0 && (
        <ol className="m-0 mt-3 list-none p-0">
          {timeline.map((t, i) => (
            <li key={t.id} className="relative flex gap-2.5 py-[5px] text-[12.5px] text-[var(--ds-ink)]">
              {i < timeline.length - 1 && (
                <span aria-hidden className="absolute top-4 -bottom-1.5 left-[3.5px] w-px bg-[var(--ds-line)]" />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-[1] mt-[5px] size-2 shrink-0 rounded-full",
                  t.state === "done"
                    ? "bg-[var(--ds-green-solid)]"
                    : t.state === "now"
                      ? "bg-[var(--ds-lilac-fg)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--ds-lilac-fg)_15%,transparent)]"
                      : "bg-[var(--ds-line-strong)]"
                )}
              />
              <span className={cn("min-w-0 flex-1", t.state === "todo" && "text-[var(--ds-muted)]")}>{t.label}</span>
              {t.time && <span className="ml-auto shrink-0 whitespace-nowrap text-[var(--ds-subtle)]">{t.time}</span>}
            </li>
          ))}
        </ol>
      )}
      {children}
    </section>
  );
}

function isPillSpec(p: unknown): p is { tone: PillTone; label: string } {
  return !!p && typeof p === "object" && "tone" in p && "label" in p && !("$$typeof" in p);
}
