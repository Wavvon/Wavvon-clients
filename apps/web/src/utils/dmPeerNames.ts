import { getScoped, setScoped } from "./accountScope";

// Names of DM peers who are not members of the hub being viewed -- a person
// found on an allied hub's People list. The conversation only carries keys,
// so without this the DM is titled by a key prefix.
const KEY = "dm_peer_names";

export function loadDmPeerNames(): Record<string, string> {
  try {
    return JSON.parse(getScoped(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function rememberDmPeerName(pubkey: string, name: string): Record<string, string> {
  const next = { ...loadDmPeerNames(), [pubkey]: name };
  setScoped(KEY, JSON.stringify(next));
  return next;
}
