/**
 * One-shot migration: existing profiles carry base64-in-localStorage images
 * for letterhead + signature. Don't force-migrate (a network outage on
 * load would leave the user stuck) — instead, when the profile loads we
 * attempt an upload-and-replace. Failures leave the data URL in place;
 * the next save will retry on its own.
 */
import { isSafeImageDataUrl } from "@/lib/safe-data-url";
import { uploadImage } from "./uploadImage";

type EmployerImagePatch = {
  letterheadDataUrl?: string;
  signatureDataUrl?: string;
};

type EmployerImageSource = {
  letterheadDataUrl?: string;
  signatureDataUrl?: string;
};

export async function migrateEmployerImages(
  source: EmployerImageSource,
): Promise<EmployerImagePatch | null> {
  const patch: EmployerImagePatch = {};

  if (isSafeImageDataUrl(source.letterheadDataUrl)) {
    const url = await uploadImage({
      dataUrl: source.letterheadDataUrl,
      filename: "letterhead",
    }).catch(() => source.letterheadDataUrl);
    if (url !== source.letterheadDataUrl) patch.letterheadDataUrl = url;
  }

  if (isSafeImageDataUrl(source.signatureDataUrl)) {
    const url = await uploadImage({
      dataUrl: source.signatureDataUrl,
      filename: "signature",
    }).catch(() => source.signatureDataUrl);
    if (url !== source.signatureDataUrl) patch.signatureDataUrl = url;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
