import { activeSession } from "../session";
import { HubApiError } from "../http";
import type { RemoteAttachment } from "@shared/types";

export async function uploadFile(
  channelId: string,
  file: File,
): Promise<RemoteAttachment> {
  const { hub_url, token } = activeSession();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${hub_url}/channels/${channelId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HubApiError(res.status, text || res.statusText);
  }
  return res.json() as Promise<RemoteAttachment>;
}
