/**
 * Small kit parts shared by the "create" screens (templates, the new letter
 * questions, settings, pricing and the setup pages). They follow
 * design/hifi/out/kit.html: segmented switch (06), dialog (08), callouts and
 * loading rows (09), fields (04). Colours come from the --ds-* tokens only.
 */
import { useId, type ComponentProps, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useProfileStore } from "@/lib/profile";

/* ------------------------------------------------------------------ */
/* Segmented switch (kit 06)                                           */
/* ------------------------------------------------------------------ */

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
  title?: string;
};

/**
 * Grey track with the selected option raised on white (hairline and a soft
 * shadow). Keyboard: arrow keys move between options (radio group pattern).
 * The row scrolls inside itself on narrow screens, never the page.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
  fill = false,
}: {
  options: SegmentOption<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
  size?: "sm" | "md";
  /** Stretch the options to fill the track. */
  fill?: boolean;
}) {
  const move = (dir: 1 | -1, from: number) => {
    const enabled = options.filter((o) => !o.disabled);
    if (enabled.length === 0) return;
    const cur = enabled.findIndex((o) => o.value === options[from]?.value);
    const next = enabled[(cur + dir + enabled.length) % enabled.length];
    onChange(next.value);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLButtonElement>(
        `[data-seg-group="${label}"] [data-value="${CSS.escape(next.value)}"]`
      );
      el?.focus();
    });
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-seg-group={label}
      className={cn(
        "no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-[var(--ds-surface-2)] p-[3px]",
        fill && "flex w-full",
        className
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on || (value === undefined && i === 0) ? 0 : -1}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(1, i);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(-1, i);
              }
            }}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] text-[13.5px] transition-colors duration-[120ms] disabled:opacity-40",
              size === "sm" ? "h-[28px] px-2.5" : "h-[32px] px-3",
              fill && "flex-1",
              on
                ? "bg-[var(--ds-surface)] font-medium text-[var(--ds-ink)] shadow-[var(--ds-shadow-s),0_0_0_1px_var(--ds-line)]"
                : "text-[var(--ds-muted)] hover:text-[var(--ds-ink)]"
            )}
          >
            {Icon && <Icon className="size-[13px] text-[var(--ds-subtle)]" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog (kit 08)                                                     */
/* ------------------------------------------------------------------ */

/** The kit dialog: white, 16px corners, soft shadow, fade and a 4px rise
 * (none with reduced motion). */
export function KitDialogContent({
  className,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        "max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[16px] p-6 shadow-[var(--ds-shadow-xl)] sm:max-w-[480px] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

export function KitDialogFooter({ className, ...props }: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn("mt-1 gap-2.5 sm:gap-2.5", className)} {...props} />;
}

/**
 * Confirmation in the kit dialog, used in place of window.confirm. Cancel is
 * the secondary button; the confirm button is dark, or red for a destructive
 * action.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  busy = false,
  destructive = false,
  onConfirm,
  cancelLabel = "Cancel",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  cancelLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KitDialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <KitDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              destructive &&
                "border-0 bg-[var(--ds-red-solid)] text-[var(--ds-on-accent)] hover:bg-[var(--ds-red-fg)] active:bg-[var(--ds-red-fg)]"
            )}
          >
            {busy && <Spinner />}
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </KitDialogFooter>
      </KitDialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback (kit 09)                                                   */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn("size-4 animate-spin motion-reduce:animate-none", className)} />;
}

const CALLOUT: Record<
  "info" | "warning" | "error" | "success",
  { box: string; icon: LucideIcon; ink: string }
> = {
  info: { box: "bg-[var(--ds-blue-soft)]", icon: Info, ink: "text-[var(--ds-blue-fg)]" },
  warning: { box: "bg-[var(--ds-amber-soft)]", icon: AlertTriangle, ink: "text-[var(--ds-amber-fg)]" },
  error: { box: "bg-[var(--ds-red-soft)]", icon: XCircle, ink: "text-[var(--ds-red-fg)]" },
  success: { box: "bg-[var(--ds-green-soft)]", icon: CheckCircle2, ink: "text-[var(--ds-green-fg)]" },
};

/** Info blue, warning amber, error red (or success green) panel with an
 * icon, a medium title, one line and an optional action on the right. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
  role,
  ...rest
}: {
  tone?: keyof typeof CALLOUT;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  role?: string;
} & Omit<ComponentProps<"div">, "title" | "children">) {
  const t = CALLOUT[tone];
  const Icon = icon ?? t.icon;
  return (
    <div
      role={role}
      className={cn("flex items-start gap-3 rounded-[12px] px-4 py-3", t.box, className)}
      {...rest}
    >
      <Icon aria-hidden className={cn("mt-[2px] size-4 shrink-0", t.ink)} />
      <div className="min-w-0 flex-1 text-[13.5px] leading-snug text-[var(--ds-ink)]">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cn(title ? "mt-0.5" : "", "text-[var(--ds-body)]")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 text-[13.5px] font-medium text-[var(--ds-ink)]">{action}</div>}
    </div>
  );
}

/** Soft grey placeholder rows (kit 09 "Loading"). */
export function LoadingRows({ rows = 3, className, label = "Loading" }: { rows?: number; className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="size-9 shrink-0 animate-pulse rounded-[10px] bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-2.5 w-2/5 animate-pulse rounded-full bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
            <span className="h-2 w-1/4 animate-pulse rounded-full bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
          </span>
          <span className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-[var(--ds-surface-2)] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/** Content that fades in together once loaded (MOTION "Lists and tables"). */
export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-[ds-fade-in_0.24s_ease_both] motion-reduce:animate-none", className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fields (kit 04)                                                     */
/* ------------------------------------------------------------------ */

/**
 * Label above, help below in muted 12.5px, error below in red with an alert
 * icon. Children receive nothing special; pass the same id to the control.
 */
export function Field({
  label,
  htmlFor,
  help,
  error,
  required,
  aside,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const auto = useId();
  const errId = `${htmlFor ?? auto}-error`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--ds-ink)]">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-[var(--ds-red-fg)]">
              *
            </span>
          )}
        </label>
        {aside && <span className="text-[12.5px] text-[var(--ds-subtle)]">{aside}</span>}
      </div>
      {children}
      {error ? (
        <p id={errId} role="alert" className="m-0 flex items-center gap-1.5 text-[12.5px] text-[var(--ds-red-fg)]">
          <AlertCircle aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : help ? (
        <p className="m-0 text-[12.5px] leading-relaxed text-[var(--ds-muted)]">{help}</p>
      ) : null}
    </div>
  );
}

/** A plain white card with a hairline (kit 07). */
export function KitCard({
  className,
  children,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      className={cn("min-w-0 rounded-[16px] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-5 sm:p-6", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

/** British English replacements for catalogue labels that use "&", and
 * for catalogue copy written with a spaced dash ("Internal appeal: ..."). */
export function plainLabel(s: string): string {
  return s.replace(/\s&\s/g, " and ").replace(/\s+[\u2014\u2013]\s+/g, ": ");
}

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

/** The workspace's short name ("Harbour Foods"), from the signed-in
 * workspace or the company on the profile; null when neither is known. */
export function useWorkspaceName(): string | null {
  const { activeTenant } = useAuth();
  const company = useProfileStore((s) => s.profile.employer.legalName);
  const raw = activeTenant?.name?.trim() || company?.trim() || "";
  return raw ? shortOrgName(raw) : null;
}

/** Strips "Ltd", "Limited" and similar suffixes (same rule as the sidebar). */
export function shortOrgName(name: string): string {
  return name.replace(/\s+(ltd\.?|limited|plc|llp|inc\.?|llc)$/i, "").trim() || name;
}

/** "just now", "5 minutes ago", "3 days ago", "2 months ago". */
export function timeAgoWords(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "just now";
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return unit(m, "minute");
  const h = Math.floor(m / 60);
  if (h < 24) return unit(h, "hour");
  const d = Math.floor(h / 24);
  if (d < 30) return unit(d, "day");
  const mo = Math.floor(d / 30);
  if (mo < 12) return unit(mo, "month");
  return unit(Math.floor(mo / 12), "year");
}
