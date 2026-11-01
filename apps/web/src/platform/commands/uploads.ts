import { activeSession } from "../session";
import { HubApiError, hubFetch } from "../http";
import type { AttachmentRef } from "@shared/types";
import type { AttachmentSettings } from "@wavvon/ui";

export async function uploadFile(
  channelId: string,
  file: File,
  asFile = false,
): Promise<AttachmentRef> {
  const { hub_url, token } = activeSession();
  const form = new FormData();
  form.append("file", file);
  if (asFile) form.append("as_file", "true");
  const res = await fetch(`${hub_url}/channels/${channelId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HubApiError(res.status, text || res.statusText);
  }
  return res.json() as Promise<AttachmentRef>;
}

export async function getAttachmentSettings(): Promise<AttachmentSettings> {
  return (await hubFetch("/hub/settings")).json() as Promise<AttachmentSettings>;
}

export async function saveAttachmentSettings(patch: Partial<AttachmentSettings>): Promise<void> {
  await hubFetch("/hub", { method: "PATCH", body: JSON.stringify(patch) });
}
