import { expect, it, vi } from "vitest";
import { imageClipboardSource, readClipboardImages } from "./clipboard-image-files";
const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "fictional.png", { type: "image/png" });
const source = (files: File[], html = "", text = "") => ({ files, html, text });
it("prefers rich HTML to duplicate image files and preserves file-only clipboard items", () => {
  const file = png(), getAsFile = vi.fn(() => file);
  const data = { getData: () => '<p>Text<img src="data:image/png;base64,YQ=="></p>', items: [{ kind: "file", type: "image/png", getAsFile }] } as unknown as DataTransfer;
  expect(typeof imageClipboardSource(data)).toBe("string"); expect(getAsFile).not.toHaveBeenCalled();
  data.getData = type => type === "text/plain" ? "Accompanying text" : "";
  expect(imageClipboardSource(data)).toEqual(source([file], "", "Accompanying text"));
});
it("uses the files collection if clipboard items are unavailable", () => {
  const file = png();
  expect(imageClipboardSource({ getData: () => "", files: [file] } as unknown as DataTransfer)).toEqual(source([file]));
  expect(imageClipboardSource(null)).toBeNull();
});
it("reads several bounded images while preserving text and escaping filenames", async () => {
  const file = new File(["fictional"], '"><script>bad</script>.png', { type: "image/png" });
  const html = await readClipboardImages(source([png(), file], "", "<b>Literal text</b>"), () => true);
  const root = document.createElement("template"); root.innerHTML = html;
  expect(root.content.querySelectorAll("img")).toHaveLength(2);
  expect(root.content.querySelector("p")?.textContent).toBe("<b>Literal text</b>");
  expect(root.content.querySelector("script")).toBeNull();
  expect(root.content.querySelectorAll("img")[1].alt).toBe(file.name);
});
it.each([new File([], "empty.png", { type: "image/png" }), new File(["x"], "vector.svg", { type: "image/svg+xml" })])("rejects unsupported or empty clipboard files before reading", async file => {
  await expect(readClipboardImages(source([png(), file]), () => true)).rejects.toThrow("2 MB each");
});
it("bounds individual sizes, image count and total bytes before reading", async () => {
  const large = png(); Object.defineProperty(large, "size", { value: 2 * 1024 * 1024 + 1 });
  await expect(readClipboardImages(source([large]), () => true)).rejects.toThrow("2 MB each");
  await expect(readClipboardImages(source(Array.from({ length: 21 }, png)), () => true)).rejects.toThrow("20 images");
  const medium = png(); Object.defineProperty(medium, "size", { value: 2 * 1024 * 1024 });
  await expect(readClipboardImages(source(Array(5).fill(medium)), () => true)).rejects.toThrow("8 MB");
});
it("rejects a late file read after the captured operation becomes stale", async () => {
  let current = true;
  const pending = readClipboardImages(source([png()]), () => current);
  current = false;
  await expect(pending).rejects.toThrow("changed");
});
