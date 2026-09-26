import { useEffect, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { removeHub, setActiveHub, listHubs, reorderHubs } from "@platform";
import type { Hub } from "@shared/types";

export interface UseHubLifecycleParams {
  loadHubData: () => Promise<void>;
  // Clears channel/conversation/alliance selection shared with the message
  // and DM hooks; App owns the wiring since those hooks' setters live
  // outside this one. `clearMessages` matches handleSwitchHub (true) vs
  // handleRemoveHub (false), same as the original inline bodies.
  resetChannelSelectionState: (clearMessages: boolean) => void;
  goToChannelsView: () => void;
}

// Hub roster state (joined hubs, active hub, per-hub ping/timezone, lobby and
// pending-approval sets) plus the switch/remove/reorder mutations. loadHubData
// itself, hub restore-on-startup, deep-link application, and lobby promotion
// stay in App.tsx — they reach into WS handler and channel-selection internals
// tangled enough that extracting them here would need multi-way ref plumbing
// for little benefit (same reasoning App.tsx already applies to loadHubData).
export function useHubLifecycle({ loadHubData, resetChannelSelectionState, goToChannelsView }: UseHubLifecycleParams) {
  const [hubs, setHubs] = useState<Hub[]>([]);
  // Active hub's ambient IANA timezone (HubClock in the sidebar header) —
  // member-facing, so fetched from /info alongside the loadHubData self-heal
  // rather than gated behind the admin settings fetch.
  const [activeHubTimezone, setActiveHubTimezone] = useState<string | null>(null);
  const [activeHubId, setActiveHubIdState] = useState<string | null>(null);
  const [pingByHub, setPingByHub] = useState<Record<string, number | null>>({});
  // lobby-survey.md Feature 1 — hubs whose session is confined to the
  // lobby (PoW below the hub's min_security_level). Detected reactively via
  // the 403 lobby_scope_confined body loadHubData() gets back from
  // /channels, which covers both the initial join and reconnect-after-close
  // (requirement: re-detect on reload) with one code path.
  const [lobbyHubs, setLobbyHubs] = useState<Set<string>>(new Set());
  const [pendingApprovalHubs, setPendingApprovalHubs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (hubs.length === 0) return;
    let cancelled = false;
    async function tick() {
      for (const h of hubs) {
        if (cancelled) return;
        try {
          const { pingHub } = await import("../platform/commands/hubs");
          const ms = await pingHub(h.hub_id);
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: ms }));
        } catch {
          if (cancelled) return;
          setPingByHub((prev) => ({ ...prev, [h.hub_id]: null }));
        }
      }
    }
    void tick();
    const interval = setInterval(() => { void tick(); }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubs.length]);

  function handleHubReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setHubs((prev) => {
      const next = arrayMove(
        prev,
        prev.findIndex((h) => h.hub_id === active.id),
        prev.findIndex((h) => h.hub_id === over.id),
      );
      reorderHubs(next.map((h) => h.hub_id)).catch(() => {});
      return next;
    });
  }

  async function handleSwitchHub(hubId: string) {
    setActiveHub(hubId);
    setActiveHubIdState(hubId);
    resetChannelSelectionState(true);
    goToChannelsView();
    await loadHubData();
  }

  async function handleRemoveHub(hubId: string) {
    await removeHub(hubId);
    const list = listHubs();
    setHubs(list);
    if (activeHubId === hubId) {
      const next = list[0]?.hub_id ?? null;
      setActiveHubIdState(next);
      resetChannelSelectionState(false);
      if (next) await loadHubData();
    }
  }

  return {
    hubs, setHubs,
    activeHubId, setActiveHubIdState,
    activeHubTimezone, setActiveHubTimezone,
    pingByHub,
    lobbyHubs, setLobbyHubs,
    pendingApprovalHubs, setPendingApprovalHubs,
    handleHubReorder,
    handleSwitchHub,
    handleRemoveHub,
  };
}
