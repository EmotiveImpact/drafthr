import { useEffect, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "framer-motion";

/**
 * iOS-style bottom sheet with three snap points (closed / half / full),
 * drag-to-dismiss, and momentum-aware snapping.
 *
 *   • Closed       — translateY(100%) — fully off-screen, pointer-events: none
 *   • Half (50vh)  — translateY(50%)  — top half of sheet visible
 *   • Full (90vh)  — translateY(0%)   — fully visible
 *
 * Drag the grab handle (or the whole header strip) to resize. Velocity-aware
 * release: fast flicks always commit (close on flick-down, expand on flick-up).
 * Slow drags snap to the nearest position.
 *
 * Sheet is mounted always at h-[90vh] and animated via transform — no
 * height-based layout thrash; GPU-composited transform stays smooth at 60fps.
 *
 * Tap-scrim dismiss and pointer-events suppression when closed are owned by
 * the parent (Editor.tsx) so they can serve both this sheet and the left
 * sidebar drawer through one scrim element.
 */

type Snap = "closed" | "half" | "full";

/** translateY percentage for each snap (relative to the sheet's own height). */
const SNAP_Y: Record<Snap, number> = {
  closed: 100,
  half: 50,
  full: 0,
};

/** Velocity above which a flick commits to the direction-of-motion target
 * regardless of how far the drag actually went. px/s. */
const FLICK_THRESHOLD_PX_PER_SEC = 600;

const SPRING = {
  type: "spring" as const,
  stiffness: 320,
  damping: 38,
  mass: 0.8,
};

export function MobileBottomSheet({
  open,
  snap,
  onSnapChange,
  onDismiss,
  children,
  /** Render the grab handle bar. Defaults to true. */
  handle = true,
  /** Apply lg:+ overrides so the sheet renders inline on desktop. Optional. */
  desktopClass,
  className,
}: {
  open: boolean;
  snap: Snap;
  onSnapChange: (next: Snap) => void;
  onDismiss: () => void;
  children: ReactNode;
  handle?: boolean;
  desktopClass?: string;
  className?: string;
}) {
  const y = useMotionValue(open ? SNAP_Y[snap] : SNAP_Y.closed);
  // Project the 0-100 motion value into a CSS percentage string so the
  // translate is height-independent.
  const yPct = useTransform(y, (n) => `${n}%`);

  // Spring to the requested snap whenever it changes externally.
  useEffect(() => {
    const target = open ? SNAP_Y[snap] : SNAP_Y.closed;
    const controls = animate(y, target, SPRING);
    return () => controls.stop();
  }, [open, snap, y]);

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    // info.offset.y is pixels dragged from drag-start position.
    // We translate that to "current y as a percentage" by using the latest
    // motion value (which already reflects drag updates).
    const currentY = y.get();
    const velocityY = info.velocity.y;

    // Hard flick down → always close.
    if (velocityY > FLICK_THRESHOLD_PX_PER_SEC) {
      onDismiss();
      return;
    }
    // Hard flick up → expand to full.
    if (velocityY < -FLICK_THRESHOLD_PX_PER_SEC) {
      onSnapChange("full");
      return;
    }

    // Otherwise snap to nearest position.
    const candidates: Snap[] = ["full", "half", "closed"];
    let best: Snap = "half";
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Math.abs(currentY - SNAP_Y[c]);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (best === "closed") onDismiss();
    else onSnapChange(best);
  };

  return (
    <motion.aside
      // Bind the projected percentage motion value to the inline style.
      style={{ y: yPct }}
      // Drag along Y, constrained so the sheet can travel between the
      // top of the screen (y=0%) and fully closed (y=100% of self).
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      // Without elastic, the sheet feels rubbery near the constraints. 0.05
      // lets users overshoot just enough for the flick gesture to register
      // without feeling like it never stops.
      dragElastic={0.05}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      // Drag handle: only the grab bar + immediate area should drag. We
      // attach drag to the whole sheet but rely on Framer's "drag controls"
      // pattern: textareas / scrollers inside the sheet have their own
      // touch handling and won't trigger the sheet drag.
      aria-hidden={!open || undefined}
      className={
        (className ?? "") +
        " fixed left-0 right-0 bottom-0 z-40 h-[90vh] bg-[var(--ds-surface)] " +
        "rounded-t-2xl shadow-[0_-12px_32px_rgba(0,0,0,0.18)] " +
        "flex flex-col touch-pan-y will-change-transform " +
        (open ? "" : "pointer-events-none ") +
        (desktopClass ?? "")
      }
    >
      {handle && (
        <button
          type="button"
          onClick={() => {
            // Tap on handle cycles: full → half → closed.
            if (snap === "full") onSnapChange("half");
            else if (snap === "half") onDismiss();
            else onSnapChange("full");
          }}
          className="block w-full pt-2.5 pb-1.5 shrink-0 group"
          aria-label={
            snap === "full"
              ? "Collapse panel to half"
              : snap === "half"
              ? "Close panel"
              : "Open panel"
          }
        >
          <span className="block h-1 w-10 rounded-full bg-[var(--ds-line)] mx-auto group-hover:bg-[var(--ds-muted)] transition" />
        </button>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </motion.aside>
  );
}

