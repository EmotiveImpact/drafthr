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
      [key: string]: unknown;
    }>;
  }
}
