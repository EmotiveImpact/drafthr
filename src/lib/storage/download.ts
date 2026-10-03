/** Use a stable authenticated URL for saved files. Object URLs must stay
 * alive long enough for the browser's asynchronous download navigation. */
export function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try { downloadUrl(url, filename); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
