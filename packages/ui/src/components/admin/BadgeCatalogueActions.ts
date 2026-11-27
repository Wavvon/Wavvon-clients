import type { BadgeAward, BadgeDef, BadgeDefRequest } from "../../types";

/** Hub badge catalogue (`badges.catalogue`). Optional on the section: hubs
 *  without the capability keep the one-off badge grant. */
export interface BadgeCatalogueActions {
  listBadgeDefs: () => Promise<BadgeDef[]>;
  /** Members per level number the rule would reach today. */
  previewBadgeDef: (req: BadgeDefRequest) => Promise<Record<string, number>>;
  createBadgeDef: (req: BadgeDefRequest) => Promise<BadgeDef>;
  setBadgeDefHidden: (id: string, hidden: boolean) => Promise<void>;
  deleteBadgeDef: (id: string) => Promise<void>;
  listBadgeAwards: (id: string) => Promise<BadgeAward[]>;
  grantBadgeDef: (id: string, subjects: string[], level?: number) => Promise<void>;
  revokeBadgeAward: (id: string, pubkey: string) => Promise<void>;
}
