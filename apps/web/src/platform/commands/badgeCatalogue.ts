import { hubFetch } from "../http";
import type { BadgeAward, BadgeCatalogueActions, BadgeDef } from "@wavvon/ui";

const json = (body: unknown) => JSON.stringify(body);

export const badgeCatalogueActions: BadgeCatalogueActions = {
  listBadgeDefs: async () => (await hubFetch("/badges/defs")).json() as Promise<BadgeDef[]>,
  previewBadgeDef: async (req) =>
    (await hubFetch("/admin/badge-defs/preview", { method: "POST", body: json(req) })).json() as Promise<Record<string, number>>,
  createBadgeDef: async (req) =>
    (await hubFetch("/admin/badge-defs", { method: "POST", body: json(req) })).json() as Promise<BadgeDef>,
  setBadgeDefHidden: async (id, hidden) => {
    await hubFetch(`/admin/badge-defs/${encodeURIComponent(id)}`, { method: "PATCH", body: json({ hidden }) });
  },
  deleteBadgeDef: async (id) => {
    await hubFetch(`/admin/badge-defs/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  listBadgeAwards: async (id) =>
    (await hubFetch(`/admin/badge-defs/${encodeURIComponent(id)}/awards`)).json() as Promise<BadgeAward[]>,
  grantBadgeDef: async (id, subjects, level) => {
    await hubFetch(`/admin/badge-defs/${encodeURIComponent(id)}/grant`, { method: "POST", body: json({ subjects, level }) });
  },
  revokeBadgeAward: async (id, pubkey) => {
    await hubFetch(`/admin/badge-defs/${encodeURIComponent(id)}/awards/${encodeURIComponent(pubkey)}`, { method: "DELETE" });
  },
};
