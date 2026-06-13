// Pure file-reading utilities. No React, no Tauri.

/** Read a File as a raw base64 string (no data-URL prefix). */
export function readFileAsB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result;
      if (typeof s !== "string") return reject(new Error("read failed"));
      // FileReader returns a data: URL; strip the "data:<mime>;base64," prefix.
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
