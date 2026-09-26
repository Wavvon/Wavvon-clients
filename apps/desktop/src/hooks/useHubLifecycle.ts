import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Hub } from "../types";

export interface UseHubLifecycleParams {
  setError: (msg: string) => void;
  clearReconnectTimer: (hubId: string) => void;
  resetAttempts: (hubId: string) => void;
  setReconnecting: (hubId: string, value: boolean) => void;
  scheduleReconnect: (hubId: string) => void;
  clearHubUnread: (hubId: string) => void;
  onHubRemovedReconnect: (hubId: string) => void;
}

// Hub roster state (joined hubs, active hub + ref mirrors, per-hub ping,
// active hub's timezone, lobby scope) plus the switch/remove/reorder/
// reconnect mutations. loadHubData itself, hub restore-on-startup, and the
// reload-on-hub-switch effect stay in App.tsx — they reach into
// loadSlashCommands/myApprovalStatus/theme-restore internals tangled enough
// that extracting them here would need multi-way plumbing for little
// benefit (same reasoning web's useHubLifecycle documents).
export function useHubLifecycle({
  setError,
  clearReconnectTimer,
  resetAttempts,
  setReconnecting,
  scheduleReconnect,
  clearHubUnread,
  onHubRemovedReconnect,
}: UseHubLifecycleParams) {
  // Multi-hub state
  const [hubs, setHubs] = useState<Hub[]>([]);
  const hubsRef = useRef<Hub[]>([]);
  useEffect(() => { hubsRef.current = hubs; }, [hubs]);

  const [activeHubId, setActiveHubId] = useState<string | null>(null);
  const activeHubIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeHubIdRef.current = activeHubId;
  }, [activeHubId]);

  // Active hub's ambient IANA timezone (HubClock in the sidebar header) —
  // member-facing, fetched alongside the rest of loadHubData rather than
  // gated behind opening the admin panel.
  const [activeHubTimezone, setActiveHubTimezone] = useState<string | null>(null);

  const [hubScope, setHubScope] = useState<Record<string, "lobby" | "member">>({});
  const lobbyHubIds = useMemo(
    () => new Set(Object.entries(hubScope).filter(([, scope]) => scope === "lobby").map(([id]) => id)),
    [hubScope],
  );

  const [pingByHub, setPingByHub] = useState<Record<string, number | null>>({});

  // Ping every connected hub every 15s so the sidebar shows current latency
  useEffect(() => {
    if (hubs.length === 0) return;
    let cancelled = false;
    async function tick() {
      for (const h of hubs) {
        try {
          const ms = await invoke<number>("ping_hub", { hubId: h.hub_id });
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: ms }));
        } catch {
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: null }));
        }
      }
    }
    tick();
    const interval = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hubs]);

  async function handleHubReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = hubs.findIndex((h) => h.hub_id === active.id);
    const newIndex = hubs.findIndex((h) => h.hub_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(hubs, oldIndex, newIndex);
    setHubs(reordered);
    try {
      await invoke("reorder_hubs", {
        hubIds: reordered.map((h) => h.hub_id),
      });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleReconnect() {
    if (!activeHubId) return;
    // Manual click is a fresh start: cancel any pending auto-retry and
    // reset backoff so a subsequent failure starts at 1s again.
    clearReconnectTimer(activeHubId);
    resetAttempts(activeHubId);
    setReconnecting(activeHubId, true);
    try {
      await invoke("reconnect_hub", { hubId: activeHubId });
      // The hub-ws-status:true event will flip hubConnected and clear
      // the banner; if reconnect succeeded but the event hasn't arrived
      // yet, the banner still shows briefly -- that's fine.
    } catch (e) {
      setError(String(e));
      setReconnecting(activeHubId, false);
      // Hand control back to the auto-reconnect loop after the manual
      // attempt fails, so we keep trying in the background.
      scheduleReconnect(activeHubId);
    }
  }

  async function handleSwitchHub(hubId: string) {
    if (hubId === activeHubId) return;
    try {
      await invoke("set_active_hub", { hubId });
      setActiveHubId(hubId);
      setHubs((prev) =>
        prev.map((h) => ({ ...h, is_active: h.hub_id === hubId }))
      );
      // Leave per-channel unread alone -- it'll clear when the user
      // actually opens the relevant channel.
    } catch (e) {
      setError(String(e));
    }
  }

  // No confirmation here: `useRemoveHubConfirm` owns the asking, because the
  // question is not a yes/no — a removed *home* hub keeps receiving DMs the
  // client stops reading, and a `confirm("Leave...")` said the one word this
  // does not do (decisions.md, "Leave hub does not leave").
  async function handleRemoveHub(hubId: string) {
    try {
      await invoke("remove_hub", { hubId });
      const remaining = await invoke<Hub[]>("list_hubs");
      setHubs(remaining);
      if (activeHubId === hubId) {
        setActiveHubId(remaining[0]?.hub_id ?? null);
      }
      clearHubUnread(hubId);
      onHubRemovedReconnect(hubId);
    } catch (e) {
      setError(String(e));
    }
  }

  return {
    hubs, setHubs, hubsRef,
    activeHubId, setActiveHubId, activeHubIdRef,
    activeHubTimezone, setActiveHubTimezone,
    hubScope, setHubScope, lobbyHubIds,
    pingByHub, setPingByHub,
    handleHubReorder,
    handleReconnect,
    handleSwitchHub,
    handleRemoveHub,
  };
}
