/** Hands bytes to the browser as a file download. */
export function downloadFile(contents: string, filename: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
