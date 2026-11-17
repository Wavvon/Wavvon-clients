import type { HubLanguagesInfo } from "@wavvon/ui";
import { hubFetch, rawFetch } from "../http";
import { activeSession, getActiveHubId, getSession, setSession } from "../session";

// The session carries the languages the client applies; a change updates it
// at once instead of waiting for the next `/info` refresh.
function remember(info: HubLanguagesInfo): HubLanguagesInfo {
  const id = getActiveHubId();
  const s = id ? getSession(id) : undefined;
  if (id && s) setSession(id, { ...s, languages: info.default || info.packs.length ? info : undefined });
  return info;
}

export async function listHubLanguages(): Promise<HubLanguagesInfo> {
  const res = await rawFetch(`${activeSession().hub_url}/hub/languages`);
  return remember((await res.json()) as HubLanguagesInfo);
}

export async function uploadHubLanguage(bytes: Uint8Array): Promise<void> {
  await hubFetch("/hub/languages", {
    method: "PUT",
    headers: { "Content-Type": "application/zip" },
    body: bytes as BodyInit,
  });
}

export async function removeHubLanguage(sha256: string): Promise<void> {
  await hubFetch(`/hub/languages/${encodeURIComponent(sha256)}`, { method: "DELETE" });
}

export async function setHubDefaultLanguage(code: string | null): Promise<void> {
  await hubFetch("/hub/languages/default", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}
