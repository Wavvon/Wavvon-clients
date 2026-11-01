import type { Attachment, AttachmentRef } from "../types";

const WARNED_EXTENSIONS = new Set(
  ("exe msi msix appx bat cmd com scr pif cpl ps1 psm1 vbs vbe js jse wsf wsh hta lnk reg jar sh command app " +
    "dmg pkg deb rpm appimage apk iso img docm xlsm pptm svg html htm xhtml mht mhtml chm url msp").split(" "),
);

export function needsDownloadWarning(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot >= 0 && WARNED_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function isAttachmentRef(a: Attachment | AttachmentRef | { url: string }): a is AttachmentRef {
  return "state" in a;
}
