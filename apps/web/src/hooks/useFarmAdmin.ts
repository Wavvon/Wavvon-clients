import { useState, useEffect } from "react";
import { rawFetch, getFarmInfo } from "@platform";
import type { Hub } from "@shared/types";
import type { FarmAdminTab } from "@components/admin/FarmSettingsPage";

interface UseFarmAdminParams {
  publicKey: string | null;
  hubs: Hub[];
}

export function useFarmAdmin({ publicKey, hubs }: UseFarmAdminParams) {
  const [showFarmSettings, setShowFarmSettings] = useState(false);
  const [farmAdminTab, setFarmAdminTab] = useState<FarmAdminTab>("general");
  const [farmAdminUrl, setFarmAdminUrl] = useState("");
  const [isFarmAdmin, setIsFarmAdmin] = useState(false);
  const [showCreateHub, setShowCreateHub] = useState(false);
  const [knownFarms, setKnownFarms] = useState<{ url: string; name: string }[]>([]);

  useEffect(() => {
    if (!publicKey || hubs.length === 0) return;
    async function checkFarmAdmin() {
      const farms: { url: string; name: string }[] = [];
      for (const hub of hubs) {
        try {
          const infoRes = await rawFetch(`${hub.hub_url}/info`);
          const info = await infoRes.json() as { farm_url?: string | null };
          if (!info.farm_url) continue;
          const farmUrl = info.farm_url as string;
          const farmInfo = await getFarmInfo(farmUrl);
          if (!farms.some((f) => f.url === farmUrl)) {
            farms.push({ url: farmUrl, name: farmInfo.name });
          }
          if (farmInfo.admin_pubkey && farmInfo.admin_pubkey === publicKey) {
            setIsFarmAdmin(true);
            setFarmAdminUrl(farmUrl);
          }
        } catch {
          // Not a farmed hub or farm unreachable — skip.
        }
      }
      setKnownFarms(farms);
    }
    void checkFarmAdmin();
  }, [publicKey, hubs.length]);

  return {
    showFarmSettings,
    setShowFarmSettings,
    farmAdminTab,
    setFarmAdminTab,
    farmAdminUrl,
    isFarmAdmin,
    showCreateHub,
    setShowCreateHub,
    knownFarms,
  };
}
