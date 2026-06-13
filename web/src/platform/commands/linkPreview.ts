import type { LinkPreview } from "@shared/types";

export async function fetchLinkPreview(
  hubUrl: string,
  url: string,
  token: string,
): Promise<LinkPreview> {
  const endpoint = `${hubUrl}/preview?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`preview fetch failed: ${res.status}`);
  return res.json() as Promise<LinkPreview>;
}
