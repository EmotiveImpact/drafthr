import { useRef, type ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The marketplace's right-hand sheet (mk-profile, mk-book): a white panel
 * 12px in from the top, right and bottom of the window, 18px corners, a soft
 * large shadow, over the dim scrim. Header and footer stay put; the body
 * scrolls. Full screen on phones. Opens with a short fade and slide (Quiet
 * tier), closes faster; with reduced motion it only fades.
 *
 * A labelled modal dialog (Radix): focus is trapped while open, the page
 * behind does not scroll, Esc and the scrim close it, and focus returns to
 * the control that opened it. The sheets open from state, not a Radix
 * Trigger, so Radix has no trigger to go back to: the opener is passed in
 * (`returnFocusTo`) or, failing that, is whatever had focus when it opened.
 */
export function SideSheet({
  open,
  onOpenChange,
  label,
  description,
  width = 540,
  header,
  footer,
  children,
  onEscapeBlocked,
  returnFocusTo,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name of the dialog. */
  label: string;
  /** Screen-reader description. */
  description?: string;
  width?: number;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** When true, Esc and the scrim do not close the sheet (work in flight). */
  onEscapeBlocked?: boolean;
  /** The button that opened the sheet; focus goes back to it on close. */
  returnFocusTo?: HTMLElement | null;
  className?: string;
}) {
  // Remember what had focus as the sheet opens (read during the render that
  // opens it, before Radix moves focus inside).
  const focusedAtOpen = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const el = document.activeElement;
    focusedAtOpen.current = el instanceof HTMLElement && el !== document.body ? el : null;
  }
  wasOpen.current = open;

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {/* Portalled to the body; the toaster's own z-index keeps a toast (an
       * error while sending) above the sheet. */}
      <D.Portal>
        <D.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-[var(--ds-scrim)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
          )}
        />
        <D.Content
          aria-label={label}
          {...(description ? {} : { "aria-describedby": undefined })}
          onEscapeKeyDown={(e) => onEscapeBlocked && e.preventDefault()}
          onPointerDownOutside={(e) => onEscapeBlocked && e.preventDefault()}
          onInteractOutside={(e) => onEscapeBlocked && e.preventDefault()}
          onCloseAutoFocus={(e) => {
            const back = [returnFocusTo, focusedAtOpen.current].find((el) => el && el.isConnected);
            if (!back) return;
            e.preventDefault();
            back.focus({ preventScroll: true });
          }}
          style={{ ["--sheet-w" as string]: `${width}px` }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-[var(--ds-surface)] text-[var(--ds-body)] shadow-[var(--ds-shadow-xl)] outline-none",
            "inset-0 rounded-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[min(var(--sheet-w),calc(100vw-24px))] sm:rounded-[18px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-6 data-[state=open]:duration-[220ms] data-[state=open]:ease-out",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-6 data-[state=closed]:duration-150",
            "motion-reduce:[--tw-enter-translate-x:0] motion-reduce:[--tw-exit-translate-x:0]",
            className,
          )}
        >
          <D.Title className="sr-only">{label}</D.Title>
          {description ? <D.Description className="sr-only">{description}</D.Description> : null}
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** The 32px square close button for a sheet header. */
export function SheetClose({ className, outlined = false }: { className?: string; outlined?: boolean }) {
  return (
    <D.Close
      aria-label="Close"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--ds-surface)] text-[var(--ds-muted)] transition-colors duration-[120ms] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-ink)] active:bg-[var(--ds-surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--ds-focus-ring)]",
        outlined && "border border-[var(--ds-line)]",
        className,
      )}
    >
      <X className="size-4" aria-hidden />
    </D.Close>
  );
}

/** A footer button that closes the sheet (Close, Cancel). */
export const SheetCloseButton = D.Close;
