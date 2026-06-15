import { Check, CheckCircle2, CloudOff, Loader2 } from "lucide-react";

/**
 * Save-status for the v2 pagedly editor. Deliberately honest: it only ever
 * claims **device** durability, because that's what the synchronous local
 * store write guarantees the instant it returns. Server/workspace sync is the
 * async dual-write mirror, which surfaces its own failure toasts — so this chip
 * never says a bare "Saved" that would imply server durability it can't promise.
 */
export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error" };

export function SaveStatusChip({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  if (state.kind === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ds-muted)]">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-red-bg)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ds-red-fg)] transition hover:opacity-90"
      >
        <CloudOff className="size-3.5" aria-hidden /> Couldn't save — retry
      </button>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-green-bg)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--ds-green-fg)]">
        <CheckCircle2 className="size-3.5" aria-hidden /> Saved on this device
      </span>
    );
  }
  // idle — the draft already exists on this device; nothing pending this session.
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ds-muted)]">
      <Check className="size-3.5" aria-hidden /> Saved on this device
    </span>
  );
}
