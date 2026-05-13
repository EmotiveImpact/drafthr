import { memo } from "react";

/**
 * Visual page-break strip that sits between two pages worth of content
 * in the V2 Edit-on-page surface. Pure decoration — the strip never
 * intercepts pointer events so the user can keep typing through it.
 *
 * Why a strip rather than a line: the paginator gives us a single
 * y-offset per break (the bottom edge of the last block that still
 * fits on a page). Rendering a thin 24-pixel slate strip with the
 * page transition label centred — "Page 1 — Page 2" — makes the
 * break legible without making the editor look stripey.
 *
 * The strip extends slightly past the page edges via negative
 * horizontal margins so it visually frames the page card rather than
 * sitting awkwardly inside its content well. The dashed top + bottom
 * borders are deliberately quiet so the strip recedes when the user
 * is mid-paragraph and reads at the page-transition moments.
 *
 * Positioning: the strips are absolute-positioned relative to a
 * container that shares its top edge with the editor's .ProseMirror
 * root, so a break y-offset (measured from .ProseMirror's top in
 * usePageBreakPositions) maps 1:1 to `top: ${y}px` here.
 */

type Props = {
  /** y-offsets within the editor coord space — output of usePageBreakPositions. */
  breakOffsets: number[];
  /** Paper width in px so the strip can frame the page edges. */
  pageWidthPx: number;
};

const STRIP_HEIGHT_PX = 28;

export const PageBreakOverlay = memo(function PageBreakOverlay({
  breakOffsets,
  pageWidthPx,
}: Props) {
  if (breakOffsets.length === 0) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {breakOffsets.map((y, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: y - STRIP_HEIGHT_PX / 2,
            left: -8,
            width: pageWidthPx + 16,
            height: STRIP_HEIGHT_PX,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // Slate-tinted strip with dashed borders top + bottom.
            // Background uses the page background-color so the editor's
            // text doesn't bleed visually into the gap.
            background:
              "linear-gradient(180deg, rgba(248, 250, 252, 0) 0%, rgba(241, 245, 249, 0.85) 50%, rgba(248, 250, 252, 0) 100%)",
            borderTop: "1px dashed #cbd5e1",
            borderBottom: "1px dashed #cbd5e1",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily:
                "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#64748b",
              background: "#ffffff",
              padding: "0 8px",
              borderRadius: 2,
            }}
          >
            {`Page ${i + 1}  ·  Page ${i + 2}`}
          </span>
        </div>
      ))}
    </div>
  );
});
