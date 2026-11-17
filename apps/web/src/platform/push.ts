import { hubFetchWithToken } from "./http";
import { getSession, hubSupports } from "./session";

// Web Push for a closed tab (Wavvon-server push.web). A browser registration
// holds one subscription with one application server key, and every hub has
// its own key, so each account and hub gets its own registration of the same
// worker, scoped under push/<account>/<hub>/.

/** The app's own address, which a relative or absolute build base both resolve to. */
function appBase(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href;
}
const META_CACHE = "wavvon-push";

export type PushNotifyMode = "all" | "mentions" | "silent";

export interface PushPrefs {
  hub?: PushNotifyMode;
  channels: Record<string, PushNotifyMode>;
}

/** What the worker shows, already translated: it has no i18n of its own. */
export interface PushTexts {
  mention: string;
  reply: string;
  dm: string;
}

export function pushSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator &&
    typeof window !== "undefined" && "PushManager" in window && typeof Notification !== "undefined";
}

function accountScope(account: string): string {
  return `${appBase()}push/${account.slice(0, 16)}/`;
}

function scopeFor(account: string, hubId: string): string {
  return `${accountScope(account)}${encodeURIComponent(hubId)}/`;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const have = sub.options.applicationServerKey;
  if (!have) return false;
  const a = new Uint8Array(have);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

async function activated(reg: ServiceWorkerRegistration): Promise<void> {
  const sw = reg.installing ?? reg.waiting;
  if (!sw || reg.active) return;
  await new Promise<void>((resolve) => {
    sw.addEventListener("statechange", () => { if (sw.state === "activated") resolve(); });
  });
}

/** Subscribe this browser to one hub's pushes, or refresh the notify modes
 *  the hub filters them by. A hub without `push.web` is skipped. */
export async function enablePush(account: string, hubId: string, prefs: PushPrefs, texts: PushTexts): Promise<void> {
  const s = getSession(hubId);
  if (!s?.token || !hubSupports(hubId, "push.web")) return;
  const scope = scopeFor(account, hubId);
  const reg = await navigator.serviceWorker.register(`${appBase()}push-sw.js`, { scope });
  await activated(reg);
  const { public_key } = await (await hubFetchWithToken(s.hub_url, s.token, "/push/vapid-key")).json() as { public_key: string };
  const key = b64urlToBytes(public_key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const { endpoint, keys } = sub.toJSON();
  await hubFetchWithToken(s.hub_url, s.token, "/push/subscriptions", {
    method: "PUT",
    body: JSON.stringify({ endpoint, keys, notify: prefs }),
  });
  const cache = await caches.open(META_CACHE);
  await cache.put(`${scope}meta`, new Response(JSON.stringify({
    hubId,
    url: appBase(),
    icon: `${appBase()}icon-192.png`,
    texts,
  })));
}

async function drop(reg: ServiceWorkerRegistration, hubId: string | null): Promise<void> {
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Telling the hub is a courtesy: once the browser unsubscribes, the push
    // service answers 410 and the hub drops the row on its own.
    const s = hubId ? getSession(hubId) : undefined;
    if (s?.token) {
      await hubFetchWithToken(s.hub_url, s.token, "/push/subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
    }
    await sub.unsubscribe().catch(() => false);
  }
  await reg.unregister().catch(() => false);
  await caches.open(META_CACHE).then((c) => c.delete(`${reg.scope}meta`)).catch(() => false);
}

/** Stop pushes from one hub to this browser for this account. */
export async function disablePush(account: string, hubId: string): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(scopeFor(account, hubId));
  if (reg && reg.scope === scopeFor(account, hubId)) await drop(reg, hubId);
}

/** Stop every push to this browser for this account (sign-out, removal). */
export async function disableAllPush(account: string): Promise<void> {
  if (!pushSupported()) return;
  const prefix = accountScope(account);
  for (const reg of await navigator.serviceWorker.getRegistrations()) {
    if (!reg.scope.startsWith(prefix)) continue;
    await drop(reg, decodeURIComponent(reg.scope.slice(prefix.length).replace(/\/$/, "")));
  }
}
