import type { Attachment, AttachmentRef } from "../types";

const WARNED_EXTENSIONS = new Set(
  ("exe msi msix appx bat cmd com scr pif cpl ps1 psm1 vbs vbe js jse wsf wsh hta lnk reg jar sh command app " +
    "dmg pkg deb rpm appimage apk iso img docm xlsm pptm svg html htm xhtml mht mhtml chm url msp xll xla xlam inf scf one vhd vhdx " +
    "appref-ms application settingcontent-ms library-ms search-ms diagcab gadget ws ocx dll sys hlp " +
    "website xbap xsl").split(" "),
);

export function needsDownloadWarning(name: string): boolean {
  // Windows drops trailing dots and spaces, so "setup.exe. " saves as setup.exe.
  name = name.replace(/[.\s]+$/, "");
  const dot = name.lastIndexOf(".");
  return dot >= 0 && WARNED_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function isAttachmentRef(a: Attachment | AttachmentRef | { url: string }): a is AttachmentRef {
  return "state" in a;
}

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

/** `path` resolved against the hub, or null when it would leave the hub's
 *  origin. The hub supplies only the path of a stored attachment. */
export function sameOriginAttachmentUrl(hubUrl: string, path: string): string | null {
  try {
    const base = new URL(hubUrl);
    // Concatenate like the server expects (a hub can live under /hub/<slug>),
    // then check where the result actually points.
    const resolved = new URL(`${hubUrl}${path}`);
    return resolved.origin === base.origin ? resolved.href : null;
  } catch {
    return null;
  }
}
