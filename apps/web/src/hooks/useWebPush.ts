import { useEffect, useRef, useState } from "react";
import i18n from "@wavvon/i18n";
import { disableAllPush, enablePush, getSession, hubSupports, pushSupported, type PushNotifyMode } from "@platform";
import { getScoped, setScoped } from "../utils/accountScope";
import type { Hub } from "@shared/types";
import type { MuteDeadlines } from "@wavvon/ui";

const OPT_IN_KEY = "wavvon.webPush";

export interface PushOpenTarget {
  hubId?: string;
  channelId?: string;
  conversationId?: string;
}

interface Params {
  accountId: string | null;
  hubs: Hub[];
  hubNotifyMode: Record<string, PushNotifyMode>;
  channelNotifyMode: Record<string, Record<string, PushNotifyMode>>;
  muteDeadlines: MuteDeadlines;
  /** A notification was clicked: go to its hub and channel or conversation. */
  onOpen: (target: PushOpenTarget) => void;
  /** The app has loaded a hub's data: a cold-start open applied before
   *  that is undone by the first hub load's own channel pick. */
  loaded: boolean;
}

export interface WebPush {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission | null;
  setEnabled: (on: boolean) => Promise<void>;
}

/** Push for a closed tab, opted into per account and device. While on, every
 *  hub that offers `push.web` holds this browser's subscription and this
 *  account's notify modes for it, refreshed whenever they change. */
export function useWebPush({ accountId, hubs, hubNotifyMode, channelNotifyMode, muteDeadlines, onOpen, loaded }: Params): WebPush {
  const supported = pushSupported();
  const [enabled, setEnabledState] = useState(() => getScoped(OPT_IN_KEY) === "1");
  const [permission, setPermission] = useState<NotificationPermission | null>(
    typeof Notification !== "undefined" ? Notification.permission : null,
  );
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // A hub joins the list before its session is up; it is in the key once it
  // can answer, so it gets subscribed then.
  const ready = hubs.filter((h) => !!getSession(h.hub_id)?.token && hubSupports(h.hub_id, "push.web"));
  const syncKey = JSON.stringify([
    enabled && permission === "granted",
    accountId,
    ready.map((h) => [
      h.hub_id, h.hub_name, hubNotifyMode[h.hub_id], channelNotifyMode[h.hub_id],
      muteDeadlines.hubs[h.hub_id], muteDeadlines.channels[h.hub_id],
    ]),
  ]);
  useEffect(() => {
    if (!supported || !enabled || permission !== "granted" || !accountId) return;
    const timer = setTimeout(() => {
      for (const h of ready) {
        const texts = {
          mention: i18n.t("push.mention", { hub: h.hub_name }),
          reply: i18n.t("push.reply", { hub: h.hub_name }),
          dm: i18n.t("push.dm", { hub: h.hub_name }),
        };
        enablePush(accountId, h.hub_id, {
          hub: hubNotifyMode[h.hub_id],
          channels: channelNotifyMode[h.hub_id] ?? {},
          hub_until: muteDeadlines.hubs[h.hub_id],
          channels_until: muteDeadlines.channels[h.hub_id] ?? {},
        }, texts)
          .catch((e) => console.warn("web push: subscribe failed", e));
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  // A click on a notification while a tab is open arrives as a message from
  // the worker; with no tab open, the worker opens one carrying it in the hash.
  useEffect(() => {
    if (!supported) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "wavvon-push-open") onOpenRef.current(e.data as PushOpenTarget);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [supported]);

  const [pendingOpen, setPendingOpen] = useState<PushOpenTarget | null>(() => {
    const m = location.hash.match(/^#push=(.+)$/);
    if (!m) return null;
    history.replaceState(null, "", location.pathname + location.search);
    try { return JSON.parse(decodeURIComponent(m[1])) as PushOpenTarget; } catch { return null; }
  });
  const pendingReady = loaded && !!pendingOpen?.hubId && !!getSession(pendingOpen.hubId)?.token;
  useEffect(() => {
    if (!pendingOpen || !pendingReady) return;
    setPendingOpen(null);
    onOpenRef.current(pendingOpen);
  }, [pendingOpen, pendingReady]);

  async function setEnabled(on: boolean) {
    if (on) {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p !== "granted") return;
    } else if (accountId) {
      await disableAllPush(accountId).catch(() => {});
    }
    try { setScoped(OPT_IN_KEY, on ? "1" : "0"); } catch { /* storage unavailable */ }
    setEnabledState(on);
  }

  return { supported, enabled, permission, setEnabled };
}
