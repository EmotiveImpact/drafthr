/**
 * Minimal type declarations for paged.js — the upstream package doesn't
 * ship its own .d.ts. We only use Previewer.preview() so the surface is
 * tiny; this declaration is enough to keep tsc happy.
 *
 * Full API: https://pagedjs.org/documentation/
 */
declare module "pagedjs" {
  export class Previewer {
    preview(
      content: string | HTMLElement,
      stylesheets: string[],
      renderTo: HTMLElement
    ): Promise<{
      total: number;
      pages?: PagedPage[];
      [key: string]: unknown;
    }>;
  }

  // Break token — the {node, offset} that ended a page. `node` is a
  // reference into the rendered clone tree; walk up to find a node we
  // stamped with our own data-paged-ref to map back to the source.
  export interface BreakToken {
    node: Node | null;
    offset: number;
  }

  // Page object. paged.js exposes the break point as `endToken` (where
  // this page stopped) and `startToken` (where it began). The README
  // calls these "break tokens" but in the runtime they live under
  // these two specific names.
  export interface PagedPage {
    element: HTMLElement;
    startToken: BreakToken | null;
    endToken: BreakToken | null;
    pageNumber?: number;
  }

  export class Chunker {
    constructor();
    pages: PagedPage[];
    flow(content: string | HTMLElement, renderTo: HTMLElement): Promise<unknown>;
    destroy?(): void;
  }
}
