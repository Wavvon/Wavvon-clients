import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AllianceInfo, AllianceSharedChannel } from "../types";

export interface AlliancesReturn {
  userAlliances: AllianceInfo[];
  setUserAlliances: React.Dispatch<React.SetStateAction<AllianceInfo[]>>;
  allianceChannels: Record<string, AllianceSharedChannel[]>;
  setAllianceChannels: React.Dispatch<React.SetStateAction<Record<string, AllianceSharedChannel[]>>>;
  loadAlliances: () => Promise<void>;
}

export function useAlliances(setError: (msg: string) => void): AlliancesReturn {
  const [userAlliances, setUserAlliances] = useState<AllianceInfo[]>([]);
  const [allianceChannels, setAllianceChannels] = useState<Record<string, AllianceSharedChannel[]>>({});

  async function loadAlliances() {
    try {
      const al = await invoke<AllianceInfo[]>("list_alliances");
      setUserAlliances(al);
      const byId: Record<string, AllianceSharedChannel[]> = {};
      await Promise.all(
        al.map(async (a) => {
          try {
            byId[a.id] = await invoke<AllianceSharedChannel[]>(
              "list_alliance_shared_channels",
              { allianceId: a.id }
            );
          } catch {
            byId[a.id] = [];
          }
        })
      );
      setAllianceChannels(byId);
    } catch {
      setUserAlliances([]);
      setAllianceChannels({});
    }
  }

  return {
    userAlliances,
    setUserAlliances,
    allianceChannels,
    setAllianceChannels,
    loadAlliances,
  };
}
