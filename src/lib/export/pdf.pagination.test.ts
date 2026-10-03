import { describe, expect, it, vi } from "vitest";
import { canvasToA4PdfBlob, canvasContentHeight } from "./pdf";

describe("canvas PDF pagination", () => {
  function render(width: number, height: number) {
    const addPage = vi.fn(), addImage = vi.fn();
    class Pdf {
      addPage = addPage;
      addImage = addImage;
      output() { return new Blob(["pdf"]); }
      save() {}
    }
    const canvas = { width, height, toDataURL: () => "data:image/jpeg;base64,test" } as HTMLCanvasElement;
    canvasToA4PdfBlob(canvas, Pdf);
    return { addPage, addImage };
  }
  it("does not create a blank page for a rounded A4 canvas", () => {
    const result = render(1588, 2246);
    expect(result.addPage).not.toHaveBeenCalled();
    expect(result.addImage).toHaveBeenCalledTimes(1);
  });
  it("retains real overflow and places the next image at the page offset", () => {
    const result = render(1588, 2300);
    expect(result.addPage).toHaveBeenCalledTimes(1);
    expect(result.addImage.mock.calls[1][3]).toBe(-11.69);
  });
  it("does not add a blank page after an exact multi-page boundary", () => {
    expect(render(1588, Math.ceil(1588 * 11.69 / 8.27 * 2)).addPage).toHaveBeenCalledTimes(1);
  });
  it("renders one page for an empty canvas without looping", () => {
    expect(render(0, 0).addImage).toHaveBeenCalledTimes(1);
  });
});

it("excludes blank trailing canvas padding but preserves the last visible pixel", () => {
  const getImageData = vi.fn((_x: number, start: number, width: number, height: number) => {
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    if (start <= 40 && start + height > 40) data[(40 - start) * width * 4] = 0;
    return { data };
  });
  const canvas = { width: 20, height: 100, getContext: () => ({ getImageData }) } as unknown as HTMLCanvasElement;
  expect(canvasContentHeight(canvas)).toBe(41);
  expect(getImageData.mock.calls.every(call => call[3] <= 32)).toBe(true);
});
it("keeps the conservative full height if canvas pixels cannot be read", () => {
  const canvas = { width: 20, height: 100, getContext: () => { throw new Error("tainted"); } } as unknown as HTMLCanvasElement;
  expect(canvasContentHeight(canvas)).toBe(100);
});
