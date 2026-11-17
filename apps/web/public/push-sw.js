// Web Push for a closed web client. One registration per account and hub
// (each hub has its own VAPID key, and a registration holds one
// subscription), scoped under push/<account>/<hub>/. The push names only the
// hub, the channel or conversation and the kind; the page left the
// notification's wording and the app's address beside the scope, because a
// worker has no translations and no session of its own.

const META_CACHE = "wavvon-push";

async function readMeta() {
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match(self.registration.scope + "meta");
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { /* not ours */ }
    const meta = await readMeta();
    const title = (meta && meta.texts && meta.texts[payload.kind]) || "Wavvon";
    await self.registration.showNotification(title, {
      tag: `${payload.kind}:${payload.channel_id || payload.conversation_id || ""}`,
      icon: meta && meta.icon,
      data: {
        hubId: meta && meta.hubId,
        url: meta && meta.url,
        channelId: payload.channel_id,
        conversationId: payload.conversation_id,
      },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const target = { type: "wavvon-push-open", hubId: d.hubId, channelId: d.channelId, conversationId: d.conversationId };
  const appUrl = d.url || self.registration.scope.replace(/push\/.*$/, "");
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(appUrl));
    if (win) {
      await win.focus();
      win.postMessage(target);
      return;
    }
    await self.clients.openWindow(`${appUrl}#push=${encodeURIComponent(JSON.stringify(target))}`);
  })());
});
