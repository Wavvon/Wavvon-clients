import { activeSession } from "./session";

export class HubApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HubApiError";
  }
}

async function checkResponse(res: Response): Promise<Response> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (import.meta.env.DEV && res.status >= 400 && res.status < 500) {
      console.warn(`[hubFetch] ${res.status} ${res.url} — ${text || res.statusText}`);
    }
    throw new HubApiError(res.status, text || res.statusText);
  }
  return res;
}

// Authenticated fetch against the active hub.
export async function hubFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { hub_url, token } = activeSession();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
    Authorization: `Bearer ${token}`,
  };
  if (init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${hub_url}${path}`, { ...init, headers });
  return checkResponse(res);
}

// Unauthenticated fetch to any URL (used during hub add).
export async function rawFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...init, headers });
  return checkResponse(res);
}
