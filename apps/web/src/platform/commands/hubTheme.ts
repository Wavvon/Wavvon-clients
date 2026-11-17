import type { HubThemeRef } from "@wavvon/ui";
import { hubFetch, rawFetch } from "../http";
import { activeSession, getActiveHubId, getSession, setSession } from "../session";

async function currentRef(): Promise<HubThemeRef | null> {
  const info = (await rawFetch(`${activeSession().hub_url}/info`).then((r) => r.json())) as { theme?: HubThemeRef };
  return info.theme ?? null;
}

// The session carries the theme the client applies; an upload or a removal
// updates it at once instead of waiting for the next `/info` refresh.
function rememberRef(theme: HubThemeRef | undefined): void {
  const id = getActiveHubId();
  const s = id ? getSession(id) : undefined;
  if (id && s) setSession(id, { ...s, theme });
}

export async function fetchCurrentHubTheme(): Promise<Uint8Array | null> {
  const ref = await currentRef();
  if (!ref) return null;
  const res = await rawFetch(`${activeSession().hub_url}/hub/theme/${ref.sha256}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function uploadHubTheme(bytes: Uint8Array): Promise<void> {
  const res = await hubFetch("/hub/theme", {
    method: "PUT",
    headers: { "Content-Type": "application/zip" },
    body: bytes as BodyInit,
  });
  rememberRef((await res.json()) as HubThemeRef);
}

export async function removeHubTheme(): Promise<void> {
  await hubFetch("/hub/theme", { method: "DELETE" });
  rememberRef(undefined);
}
