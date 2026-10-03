import { isAllowedEmbeddedImageFile } from "../safe-data-url";

export type ImageClipboardSource = string | { html: string; text: string; files: File[] };

/** HTML already containing images wins over its duplicate binary clipboard
 * representation. Otherwise retain accompanying text alongside image files. */
export function imageClipboardSource(data: DataTransfer | null): ImageClipboardSource | null {
  if (!data) return null;
  const html = data.getData("text/html");
  if (/<img\b/i.test(html)) return html;
  const files = Array.from(data.items ?? []).filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile()).filter((file): file is File => !!file);
  if (!files.length) files.push(...Array.from(data.files ?? []).filter(file => file.type.startsWith("image/")));
  return files.length ? { html, text: data.getData("text/plain"), files } : null;
}

/** Read only bounded raster files, without uploading or changing the clipboard.
 * The caller captures its editor/selection/session BEFORE awaiting these reads. */
export async function readClipboardImages(source: ImageClipboardSource, isCurrent: () => boolean): Promise<string> {
  const check = () => { if (!isCurrent()) throw new Error("The editor or workspace changed. Paste again when ready."); };
  check();
  if (typeof source === "string") return source;
  if (source.files.length > 20 || source.files.reduce((size, file) => size + file.size, 0) > 8 * 1024 * 1024) {
    throw new Error("Paste at most 20 images and 8 MB in total. Nothing was inserted.");
  }
  if (source.files.some(file => !isAllowedEmbeddedImageFile(file) || !file.size || file.size > 2 * 1024 * 1024)) {
    throw new Error("Pasted images must be PNG, JPEG, WebP or GIF up to 2 MB each. Use Upload new for larger evidence files.");
  }
  if (source.html.length > 12 * 1024 * 1024 || source.text.length > 12 * 1024 * 1024) throw new Error("Paste a smaller text selection. Nothing was inserted.");
  const root = document.createElement("template");
  if (source.html) root.innerHTML = source.html;
  else if (source.text) { const p = document.createElement("p"); p.textContent = source.text; root.content.append(p); }
  for (const file of source.files) {
    check();
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reader.onabort = () => reject(new Error("Could not read a clipboard image. Nothing was inserted."));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read a clipboard image."));
      reader.readAsDataURL(file);
    });
    check();
    const image = document.createElement("img"); image.setAttribute("src", url); image.setAttribute("alt", file.name || "Pasted image");
    root.content.append(image);
  }
  return root.innerHTML;
}
