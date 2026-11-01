import { invoke } from "@tauri-apps/api/core";
import type { AttachmentRef } from "@wavvon/ui";
import { readFileAsB64 } from "./files";

export async function uploadAttachment(channelId: string, file: File, asFile = false): Promise<AttachmentRef> {
  return invoke<AttachmentRef>("upload_attachment", {
    channelId,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    bytesB64: await readFileAsB64(file),
    asFile,
  });
}
