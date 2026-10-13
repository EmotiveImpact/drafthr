import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Pieces shared by the Settings panes (design/hifi/screens/settings.mjs):
 * the pane header row, plain white cards with hairlines (kit 07), a
 * two-column field grid, a kit select and the Save row with its short
 * "Saved" confirmation.
 */

/** Newsreader 28px title, a 13.5px muted line and an optional link on the right. */
export function PaneHeader({ title, line, right }: { title: string; line?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-[18px] flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 className="ds-title m-0 text-[28px] leading-[1.15] tracking-[-0.018em] text-[var(--ds-ink)]">{title}</h2>
        {line && <p className="m-0 mt-1 text-[13.5px] leading-relaxed text-[var(--ds-muted)]">{line}</p>}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/** A plain right-hand header link ("Billing history"). */
export function PaneLink({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] text-[14px] text-[var(--ds-ink)] transition-colors duration-[120ms] hover:text-[var(--ds-body)] hover:underline hover:underline-offset-[3px] disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

/** White card, 16px corners, hairline; optional title row with actions. */
export function SettingsCard({
  title,
  description,
  actions,
  icon,
  children,
  className,
  ...rest
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentProps<"section">, "title">) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] px-5 py-[18px] sm:px-[22px] sm:py-5",
        className
      )}
      {...rest}
    >
      {(title || actions) && (
        <div className={cn("flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3", children ? "mb-4" : "")}>
          <div className={cn("flex min-w-0 flex-1 basis-[280px] gap-3", description ? "items-start" : "items-center")}>
            {icon ? (
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--ds-surface-2)] text-[var(--ds-muted)] [&_svg]:size-[17px]">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {title && <h3 className="m-0 text-[15.5px] font-medium leading-snug text-[var(--ds-ink)]">{title}</h3>}
              {description && (
                <p className="m-0 mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-[var(--ds-muted)]">{description}</p>
              )}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2", className)}>{children}</div>;
}

export type KitOption = { value: string; label: string; hint?: string };

/** A kit select that fills its field. */
export function KitSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Choose one",
  disabled,
  className,
  ariaLabel,
  size,
}: {
  id?: string;
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: KitOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  size?: "sm" | "default";
}) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} size={size} className={cn("w-full min-w-0", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.hint ? (
              <span className="flex min-w-0 flex-col">
                <span>{o.label}</span>
                <span className="text-[12.5px] text-[var(--ds-muted)]">{o.hint}</span>
              </span>
            ) : (
              o.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A small green "Saved" pill with a tick. */
export function SavedPill({ children = "Saved" }: { children?: ReactNode }) {
  return (
    <span
      role="status"
      className="inline-flex h-[22px] animate-[ds-fade-in_0.18s_ease_both] items-center gap-1 rounded-full bg-[var(--ds-green-bg)] px-2 text-[12px] font-medium text-[var(--ds-green-fg)] motion-reduce:animate-none"
    >
      <Check aria-hidden className="size-3" />
      {children}
    </span>
  );
}

/** Flash "Saved" for about 1.5 seconds after each save. */
export function useSavedFlash(ms = 1500): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = () => {
    window.clearTimeout(timer.current);
    setOn(true);
    timer.current = window.setTimeout(() => setOn(false), ms);
  };
  return [on, flash];
}

/** The dark Save button at the end of a pane, with the "Saved" pill beside it. */
export function SaveRow({ onSave, saved }: { onSave: () => void; saved: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
      {saved && <SavedPill />}
      <Button onClick={onSave}>
        <Save className="size-4" />
        Save
      </Button>
    </div>
  );
}

/** A definition row used inside cards (label left, value right). */
export function DefRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="text-[13px] text-[var(--ds-subtle)]">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-right text-[13px] text-[var(--ds-ink)]">{children}</dd>
    </div>
  );
}
