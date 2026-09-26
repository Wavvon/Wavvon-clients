import { useCallback, useState } from "react";
import { loadIdentity, masterPubkeyOf } from "@identity/index";
import { getHomeHubDesignation, leaveHub, hubSupports } from "@platform";
import { rawFetch } from "../platform/http";
import { homeHubStatus } from "@wavvon/ui";
import type { Hub } from "@shared/types";

interface Pending {
  hubId: string;
  hubName: string;
}

/** Gate `handleRemoveHub` behind a confirmation, and work out what the dialog
 *  should warn about.
 *
 *  The warning is the only part that needs anything asynchronous: whether this
 *  hub is in the identity's signed home hub list, and whether it is the last
 *  one. That answer decides nothing here — removal is local either way — it
 *  only decides what the user is told (decisions.md, "Leave hub does not
 *  leave").
 *
 *  A lookup that fails leaves `homeHub` null and the dialog silent on the
 *  subject. Guessing "not a home hub" would be the wrong way to be wrong: the
 *  warning exists precisely because nothing else would mention it. */
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
    // A hub that does not advertise hub.leave answers 404, and offering the
    // action there would leave someone believing they left.
    setCanLeave(hubSupports(hubId, "hub.leave"));
    setLeaveNeedsInvite(false);
    setPending({ hubId, hubName: hub?.hub_name ?? hub?.hub_url ?? hubId });

    // Read the farewell now rather than from the cached SavedHub: the operator
    // may have changed it since this client last looked, and this is the one
    // moment it is shown. A hub that is unreachable or predates the field
    // simply has none.
    if (hub?.hub_url) {
      void rawFetch(`${hub.hub_url.replace(/\/+$/, "")}/info`)
        .then((r) => r.json() as Promise<{ farewell_label?: string | null; invite_only?: boolean }>)
        .then((info) => {
          setFarewell(info.farewell_label ?? null);
          // Leaving drops the roles and the invite gate is "has no roles", so
          // on an invite-only hub the return that is free today stops being.
          setLeaveNeedsInvite(info.invite_only === true);
        })
        .catch(() => {});
    }

    void (async () => {
      try {
        const identity = await loadIdentity();
        if (!identity) return;
        const designation = await getHomeHubDesignation(masterPubkeyOf(identity));
        if (!designation) return;
        setHomeHub(homeHubStatus(designation.hubs, hub?.hub_url ?? ""));
      } catch {
        /* leave it null — the dialog then says nothing about home hubs */
      }
    })();
  }, []);

  /** Leave for real, where the hub offers it. Distinct from confirm(): that
   *  one forgets the hub locally and is reversible; this asks the hub to
   *  delete the profile and the roles, and is not. */
  const leave = useCallback(async () => {
    if (!pending) return;
    const { hubId } = pending;
    setPending(null);
    setHomeHub(null);
    setFarewell(null);
    await leaveHub(hubId);
  }, [pending]);

  const cancel = useCallback(() => {
    setPending(null);
    setHomeHub(null);
    setFarewell(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const { hubId } = pending;
    setPending(null);
    setHomeHub(null);
    setFarewell(null);
    await removeHub(hubId);
  }, [pending, removeHub]);

  return { pending, homeHub, farewell, canLeave, leaveNeedsInvite, requestRemoveHub, cancel, confirm, leave };
}
