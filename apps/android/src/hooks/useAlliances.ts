import { useState } from "react";
import type { AllianceInfo, AllianceSharedChannel } from "@shared/types";

export interface AlliancesReturn {
  userAlliances: AllianceInfo[];
  setUserAlliances: React.Dispatch<React.SetStateAction<AllianceInfo[]>>;
  allianceChannels: Record<string, AllianceSharedChannel[]>;
}

export function useAlliances(): AlliancesReturn {
  const [userAlliances, setUserAlliances] = useState<AllianceInfo[]>([]);
  const [allianceChannels] = useState<Record<string, AllianceSharedChannel[]>>({});

  return {
    userAlliances,
    setUserAlliances,
    allianceChannels,
  };
}
