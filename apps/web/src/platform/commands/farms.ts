import { rawFetch } from "../http";
import { allSessions } from "../session";
import type {
  FarmSettings,
  FarmHubEntry,
  FarmUserEntry,
  FarmPublicInfo,
  FarmInfo,
  FarmHubQuota,
  CreatedFarmHub,
} from "@shared/types";

function sessionTokenForFarm(farmUrl: string): string | null {
  const farmOrigin = (() => {
    try { return new URL(farmUrl).origin; } catch { return null; }
  })();
  if (!farmOrigin) return null;
  for (const s of allSessions()) {
    try {
      if (new URL(s.hub_url).origin === farmOrigin) return s.token;
    } catch {}
  }
  return null;
}

async function farmFetch(
  farmUrl: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = sessionTokenForFarm(farmUrl);
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const url = farmUrl.replace(/\/$/, "") + path;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  return res;
}

export async function probeFarm(farmUrl: string): Promise<FarmPublicInfo> {
  const url = farmUrl.replace(/\/$/, "");
  return rawFetch(`${url}/farm/public-info`).then(
    (r) => r.json() as Promise<FarmPublicInfo>,
  );
}

export async function getFarmInfo(farmUrl: string): Promise<FarmInfo> {
  const url = farmUrl.replace(/\/$/, "");
  return rawFetch(`${url}/farm/info`).then(
    (r) => r.json() as Promise<FarmInfo>,
  );
}

export async function getFarmHubQuota(farmUrl: string): Promise<FarmHubQuota> {
  return farmFetch(farmUrl, "/farm/me/hub-quota").then(
    (r) => r.json() as Promise<FarmHubQuota>,
  );
}

export async function getFarmSettings(farmUrl: string): Promise<FarmSettings> {
  return farmFetch(farmUrl, "/farm/settings").then(
    (r) => r.json() as Promise<FarmSettings>,
  );
}

export async function patchFarmSettings(
  farmUrl: string,
  settings: Partial<FarmSettings>,
): Promise<FarmSettings> {
  return farmFetch(farmUrl, "/farm/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  }).then((r) => r.json() as Promise<FarmSettings>);
}

export async function getFarmHubsAdmin(
  farmUrl: string,
): Promise<{ hubs: FarmHubEntry[] }> {
  return farmFetch(farmUrl, "/farm/hubs?include=all").then(
    (r) => r.json() as Promise<{ hubs: FarmHubEntry[] }>,
  );
}

export async function suspendFarmHub(
  farmUrl: string,
  hubId: string,
  suspended: boolean,
  reason: string | null,
): Promise<void> {
  if (suspended) {
    await farmFetch(farmUrl, `/farm/hubs/${hubId}/suspend`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    });
  } else {
    await farmFetch(farmUrl, `/farm/hubs/${hubId}/unsuspend`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
  }
}

export async function deleteFarmHub(
  farmUrl: string,
  hubId: string,
): Promise<void> {
  await farmFetch(farmUrl, `/farm/hubs/${hubId}`, { method: "DELETE" });
}

export async function getFarmUsers(
  farmUrl: string,
  page: number,
  limit: number,
): Promise<{ users: FarmUserEntry[]; total: number; page: number; limit: number }> {
  return farmFetch(farmUrl, `/farm/users?page=${page}&limit=${limit}`).then(
    (r) =>
      r.json() as Promise<{
        users: FarmUserEntry[];
        total: number;
        page: number;
        limit: number;
      }>,
  );
}

export async function revokeFarmUserSessions(
  farmUrl: string,
  pubkey: string,
): Promise<void> {
  await farmFetch(farmUrl, `/farm/users/${pubkey}/revoke-sessions`, {
    method: "POST",
    body: JSON.stringify({ all: true }),
  });
}

export interface FarmServerEntry {
  id: string;
  name: string;
  region: string | null;
  connected: boolean;
  last_seen_at: number | null;
}

export async function getFarmServers(
  farmUrl: string,
): Promise<{ servers: FarmServerEntry[] }> {
  return farmFetch(farmUrl, "/farm/admin/servers").then(
    (r) => r.json() as Promise<{ servers: FarmServerEntry[] }>,
  );
}

export async function generateFarmServerToken(
  farmUrl: string,
  name: string,
  region: string | null,
): Promise<{ server_id: string; token: string }> {
  return farmFetch(farmUrl, "/farm/admin/server-token", {
    method: "POST",
    body: JSON.stringify({ name, region }),
  }).then((r) => r.json() as Promise<{ server_id: string; token: string }>);
}

export async function farmTotpSetup(
  farmUrl: string,
): Promise<{ secret: string; qr_url: string }> {
  return farmFetch(farmUrl, "/farm/admin/totp/setup", { method: "POST" }).then(
    (r) => r.json() as Promise<{ secret: string; qr_url: string }>,
  );
}

export async function farmTotpConfirm(
  farmUrl: string,
  secret: string,
  code: string,
): Promise<void> {
  await farmFetch(farmUrl, "/farm/admin/totp/confirm", {
    method: "POST",
    body: JSON.stringify({ secret, code }),
  });
}

export async function farmTotpDisable(
  farmUrl: string,
  code: string,
): Promise<void> {
  await farmFetch(farmUrl, "/farm/admin/totp/disable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function createHubOnFarm(
  farmUrl: string,
  name: string,
  description: string | null,
  visibility: "public" | "private",
): Promise<CreatedFarmHub> {
  return farmFetch(farmUrl, "/farm/hubs", {
    method: "POST",
    body: JSON.stringify({ name, description, visibility }),
  }).then((r) => r.json() as Promise<CreatedFarmHub>);
}
