import { activeSession } from "./session";

export class HubApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HubApiError";
  }
}

// A hub-side per-account list (dm-blocks, passkeys, trusted devices) 404s or
// 403s when the account being managed (via hubFetchAs — see
// platform/hubFetchAs.ts) has never joined the active hub. Sections managing
// a non-active account use this to show a friendly "not a member" notice
// instead of a raw error string.
export function isNotMemberError(e: unknown): boolean {
  return e instanceof HubApiError && (e.status === 403 || e.status === 404);
}

// Default ceiling for a single network request. Without this a call to an
// unreachable host (a mistyped hub address, a down discovery service) hangs
// indefinitely and the UI is stuck on a spinner; with it the caller gets a
// clear "unreachable" error to surface.
export const DEFAULT_FETCH_TIMEOUT_MS = 10000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// fetch() with a timeout that turns "host unreachable / hung" into a clear,
// user-presentable Error instead of an indefinite pending promise. If the
// caller passes its own AbortSignal it is respected (and not overridden).
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError" && controller.signal.aborted) {
      throw new Error(`Timed out reaching ${hostOf(url)} — it may be offline or unreachable.`);
    }
    if (e instanceof TypeError) {
      // Browser network failure (DNS, refused, CORS, offline).
      throw new Error(`Could not reach ${hostOf(url)} — check the address and your connection.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
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

// Authenticated fetch against an explicit hub + token — the shared core
// behind both hubFetch (active session) and hubFetchAs (a non-active local
// account's background-acquired token; see platform/hubFetchAs.ts).
export async function hubFetchWithToken(
  hub_url: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
    Authorization: `Bearer ${token}`,
  };
  if (init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetchWithTimeout(`${hub_url}${path}`, { ...init, headers });
  return checkResponse(res);
}

// Authenticated fetch against the active hub.
export async function hubFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const { hub_url, token } = activeSession();
  return hubFetchWithToken(hub_url, token, path, init);
}

// Unauthenticated fetch to any URL (used during hub add).
export async function rawFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetchWithTimeout(url, { ...init, headers });
  return checkResponse(res);
}
