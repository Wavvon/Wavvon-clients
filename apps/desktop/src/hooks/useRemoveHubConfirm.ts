import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { homeHubStatus } from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { Hub } from "../types";

interface Pending {
  hubId: string;
  hubName: string;
}

interface HubInfoPeek {
  farewell_label?: string | null;
  invite_only?: boolean;
  capabilities?: string[];
}

/** Gate hub removal behind the shared confirmation, and work out what the
 *  dialog should warn about. Desktop's port of the web hook of the same name.
 *
 *  Before this, desktop asked `confirm("Leave \"X\"?")` — the one word the
 *  dialog exists to avoid, since removing is local and reversible and does
 *  not leave anything (decisions.md, "Leave hub does not leave").
 *
 *  The capability comes from the hub's own `/info` rather than a cached list:
 *  desktop keeps no per-hub capability set, and this is one request at the one
 *  moment the answer is needed. A lookup that fails leaves the dialog silent
 *  on home hubs and offers no leave — both are the safe direction. */
export function useRemoveHubConfirm(removeHub: (hubId: string) => Promise<void>) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [homeHub, setHomeHub] = useState<{ isHomeHub: boolean; isLast: boolean } | null>(null);
  const [farewell, setFarewell] = useState<string | null>(null);
  const [canLeave, setCanLeave] = useState(false);
  const [leaveNeedsInvite, setLeaveNeedsInvite] = useState(false);

  const requestRemoveHub = useCallback((hubId: string, hubs: Hub[]) => {
    const hub = hubs.find((h) => h.hub_id === hubId);
    setHomeHub(null);
    setFarewell(null);
    setCanLeave(false);
    setLeaveNeedsInvite(false);
    setPending({ hubId, hubName: hub?.hub_name ?? hub?.hub_url ?? hubId });

    if (hub?.hub_url) {
      void fetchWithTimeout(`${hub.hub_url.replace(/\/+$/, "")}/info`)
        .then((r) => r.json() as Promise<HubInfoPeek>)
        .then((info) => {
          setFarewell(info.farewell_label ?? null);
          // Leaving drops the roles and the invite gate is "has no roles", so
          // on an invite-only hub the return that is free today stops being.
          setLeaveNeedsInvite(info.invite_only === true);
          setCanLeave(info.capabilities?.includes("hub.leave") === true);
        })
        .catch(() => {});
    }

    void invoke<{ hubs: string[] } | null>("get_home_hub_list")
      .then((designation) => {
        if (!designation) return;
        setHomeHub(homeHubStatus(designation.hubs, hub?.hub_url ?? ""));
      })
      .catch(() => {
        /* leave it null — the dialog then says nothing about home hubs */
      });
  }, []);

  const clear = () => {
    setPending(null);
    setHomeHub(null);
    setFarewell(null);
  };

  /** Leave for real, where the hub offers it. Distinct from confirm(): that
   *  one forgets the hub locally and is reversible; this asks the hub to
   *  delete the profile and the roles, and is not. */
  const leave = useCallback(async () => {
    if (!pending) return;
    const { hubId } = pending;
    clear();
    await invoke("leave_hub", { hubId });
  }, [pending]);

  const cancel = useCallback(clear, []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const { hubId } = pending;
    clear();
    await removeHub(hubId);
  }, [pending, removeHub]);

  return { pending, homeHub, farewell, canLeave, leaveNeedsInvite, requestRemoveHub, cancel, confirm, leave };
}
