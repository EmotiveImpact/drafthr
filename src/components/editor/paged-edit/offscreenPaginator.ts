/**
 * Off-screen paginator — runs paged.js Chunker against a hidden render
 * surface to discover where A4 pages would break, without showing the
 * paginated result to the user.
 *
 * The pixel-perfect Edit-on-page V2 flow:
 *   1. User types in a single continuous TipTap editor (the source).
 *   2. Each block in the editor carries a stable `data-paged-ref`
 *      attribute (added by the PagedRefMark TipTap extension — Commit 4).
 *   3. After a debounced delay we serialise the editor's HTML and hand
 *      it to `paginate()` here.
 *   4. Chunker renders the HTML into an off-screen DOM, applying the
 *      same print CSS as Preview. As it walks the rendered DOM looking
 *      for column overflow it produces BreakToken `{node, offset}`
 *      pairs — one per page transition.
 *   5. We walk up from each break-token node to find the nearest
 *      element with our `data-paged-ref`. That ref is the stable
 *      bridge back to the live TipTap node.
 *   6. The hook (Commit 4) then locates that node in the editor's
 *      visible DOM and reads its `getBoundingClientRect()` to know
 *      where to overlay the page-break strip.
 *
 * The render is required (not optional) — Chunker uses live browser
 * layout to decide where text overflows; there is no virtual-DOM
 * shortcut. We position the host off-screen at left:-99999px so the
 * scroll surface isn't extended. visibility:hidden and display:none
 * both break paged.js measurement, so we use plain transparent
 * absolute positioning instead.
 *
 * Performance: ~150-400ms cold (3 pages, no images). The hook
 * debounces keystrokes 300ms before calling us so we don't pile up.
 */

import { wrapInPrintHtml } from "./printCss";

export type PaginationBreak = {
  /** 1-based page number that ENDS at this break. */
  pageNumber: number;
  /**
   * The `data-paged-ref` of the source block where this page ended,
   * or null if no stable ref was found in the break node's ancestry
   * (only happens at the very last page or for the figures appendix,
   * which has no break).
   */
  sourceRef: string | null;
  /**
   * Character offset inside the source block where the break occurred,
   * if the break landed mid-text-node. -1 if the break was at a block
   * boundary.
   */
  sourceOffset: number;
};

export type PaginationResult = {
  pageCount: number;
  /**
   * One entry per page transition — i.e. breaks.length === max(pageCount - 1, 0).
   * Final page has no break token. Order matches page order top-to-bottom.
   */
  breaks: PaginationBreak[];
};

let cachedPreviewer: typeof import("pagedjs").Previewer | null = null;

async function getPreviewer() {
  if (cachedPreviewer) return cachedPreviewer;
  const mod = await import("pagedjs");
  cachedPreviewer = mod.Previewer;
  return cachedPreviewer;
}

/**
 * Find the last `data-paged-ref` element inside a rendered page. That
 * element is the last source block whose content is still visible on
 * the page — i.e. the block AFTER which the page-break overlay should
 * land in the editor.
 *
 * We use this instead of the `endToken.node` source-DOM walk because
 * paged.js mutates the source fragment during flow and the source
 * elements lose their parent chain by the time we read them.
 */
function lastRefInRenderedPage(pageEl: HTMLElement | null): string | null {
  if (!pageEl) return null;
  const refs = pageEl.querySelectorAll<HTMLElement>("[data-paged-ref]");
  if (refs.length === 0) return null;
  return refs[refs.length - 1].getAttribute("data-paged-ref");
}

/**
 * Paginate `bodyHtml` (a fragment, not a full document) and return the
 * page count + per-page-transition break info. Caller is responsible
 * for stamping `data-paged-ref` attributes on each block they want to
 * map back to before passing the HTML in.
 *
 * Safe to call concurrently — each call uses its own host element and
 * its own Chunker instance.
 */
export async function paginate(bodyHtml: string): Promise<PaginationResult> {
  const Previewer = await getPreviewer();

  const host = document.createElement("div");
  // Hide strategy: visibility:hidden + absolute positioning at (0,0).
  // - display:none makes getBoundingClientRect return zeros and the
  //   chunker can't measure overflow.
  // - left:-99999px (the obvious choice) confuses paged.js's column
  //   measurement and produces "phantom" duplicate pages — verified
  //   empirically. Keeping the host in the viewport's coordinate space
  //   but invisible is the only combination that yields the same page
  //   count as Preview.
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-paged-offscreen", "true");
  host.style.cssText =
    "position: absolute; top: 0; left: 0; visibility: hidden; pointer-events: none; z-index: -1;";
  document.body.appendChild(host);

  try {
    const previewer = new Previewer();
    const full = wrapInPrintHtml(bodyHtml);
    // Previewer wraps Chunker + Polisher — Polisher extracts the @page
    // rules from our embedded <style> so Chunker doesn't render them as
    // visible text. The second arg is `stylesheets` (we have none —
    // they're embedded in the doc string already).
    const flow = await previewer.preview(full, [], host);
    const pages = (flow as { pages?: import("pagedjs").PagedPage[] }).pages ?? [];
    const breaks: PaginationBreak[] = [];
    // For each page transition (all pages except the last) find the
    // last source block whose content is still on this page. The
    // overlay strip then lands right after that block in the editor.
    for (let i = 0; i < pages.length - 1; i++) {
      const sourceRef = lastRefInRenderedPage(pages[i].element);
      breaks.push({ pageNumber: i + 1, sourceRef, sourceOffset: -1 });
    }
    return { pageCount: pages.length, breaks };
  } finally {
    host.remove();
  }
}
