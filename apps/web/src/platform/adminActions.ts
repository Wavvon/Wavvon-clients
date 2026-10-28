// Action objects wired purely from static @platform imports — no App state,
// so they're built once at module scope instead of every render. Anything
// that closes over App state (userContextMenuActions, the various
// render*/onSave callbacks) stays in App.tsx or its container wrappers.
import {
  getUserProfile, listRoleCategories, patchMyProfileOnHub,
  activeHubSupports, listPermissionCatalogue,
} from "@platform";
import { getHubSettings, saveHubSettings } from "@platform";
import {
  getChannelPermissions, setChannelRolePermissions, clearChannelRolePermissions,
  listChannelBans, banFromChannel, unbanFromChannel,
  listHubIcons, getTalkPower, setTalkPower,
} from "@platform";
import {
  listRoles, createRole, updateRole, deleteRole,
  createRoleCategory, updateRoleCategory, deleteRoleCategory,
  listUserRoles, assignRoleToUser, removeRoleFromUser,
  getDiscoveryTags, setDiscoveryTags,
  listBadges, listPendingBadges, acceptBadge, declineBadge, removeBadge, grantBadge,
  createHubIcon, renameHubIcon, deleteHubIcon,
  getAuditLog,
  listCertIssuances, getCertSettings, saveCertSettings, issueCertManual, revokeCert, grantUserBadge,
  listSoundboardClips, uploadSoundboardClip, deleteSoundboardClip,
  listPendingUsers, approvePendingUser, setLobbySettings, setChallengeSettings,
  getSurveyAdmin, setSurveyAdmin, getSurveyResponses,
  listAlliances, createAlliance, leaveAlliance,
  listPendingAllianceInvites, acceptAllianceInvite, declineAllianceInvite,
  listAllianceSharedChannels, shareChannelWithAlliance, unshareChannelFromAlliance,
  setAllianceVoiceRemoteJoin,
  createAllianceInvite, sendAlliancePushInvite, joinAllianceByCode,
  getAlliancePeopleVisible, setAlliancePeopleVisible,
  listAllianceManagers, grantAllianceManager, revokeAllianceManager,
  getAllianceMembers, listHubs, getActiveHubId, rawFetch,
} from "@platform";
import { knownIssuerHubs, type IssuerHub } from "@wavvon/ui";
import { fetchSoundboardAudioBytes } from "@platform";
import {
  adminListWebhooks, adminCreateWebhook, adminRegenerateWebhook, adminDeleteWebhook,
} from "./commands/apps";
import {
} from "@platform";
import { loadDefaultProfile, saveDefaultProfile, loadFollowsDefault } from "../utils/profiles";
import type {
  UserProfileCardActions,
  ChannelPermissionsTabActions, ChannelBansTabActions, ChannelTalkPowerTabActions,
  RolesSectionActions, MemberRoleManagerActions, ServerTagsSectionActions, InviteManagerActions,
  AuditLogSectionActions, CertificationsSectionActions,
  SoundboardAdminSectionActions, OnboardingAdminSectionActions,
} from "@wavvon/ui";

// The member profile card's own-profile save also propagates to every other
// hub following the account's default profile (see utils/profiles.ts) — pure
// module-level plumbing, no App state needed.
export const profileCardActions: UserProfileCardActions = {
  getUserProfile: (pubkey) => getUserProfile(pubkey),
  listRoleCategories: () => listRoleCategories(),
  saveMyProfile: async (hubId, fields) => {
    await patchMyProfileOnHub(hubId, fields);
    const follows = loadFollowsDefault();
    if (follows.includes(hubId)) {
      const def = loadDefaultProfile();
      if (def) saveDefaultProfile({ ...def, ...fields });
      for (const hid of follows) {
        if (hid !== hubId) {
          try { await patchMyProfileOnHub(hid, fields); } catch { /* offline hub catches up later */ }
        }
      }
    }
  },
};

export const channelPermissionsTabActions: ChannelPermissionsTabActions = {
  getChannelPermissions,
  setChannelRolePermissions,
  clearChannelRolePermissions,
  listRoles,
  // The hub owns the catalogue; this build only knows how to name the ids.
  // Gated on the capability because an older hub has no such route at all.
  listPermissionCatalogue: async () =>
    activeHubSupports("permissions.catalogue") ? listPermissionCatalogue() : [],
};

export const channelBansTabActions: ChannelBansTabActions = {
  listChannelBans,
  banFromChannel,
  unbanFromChannel,
};

export const channelTalkPowerTabActions: ChannelTalkPowerTabActions = {
  getTalkPower,
  setTalkPower,
};

export const rolesActions = {
  listRoles, createRole, updateRole, deleteRole,
  listRoleCategories, createRoleCategory, updateRoleCategory, deleteRoleCategory,
  // What this screen offers to tick comes from the hub, exactly as it does on
  // the channel overwrite tab. Gated on the capability because an older hub
  // has no such route at all.
  listPermissionCatalogue: async () =>
    activeHubSupports("permissions.catalogue") ? listPermissionCatalogue() : [],
} as RolesSectionActions;

export const memberRoleActions = { listRoles, listUserRoles, assignRoleToUser, removeRoleFromUser } as MemberRoleManagerActions;

export const serverTagsActions = {
  getDiscoveryTags, setDiscoveryTags,
  listBadges, listPendingBadges, acceptBadge, declineBadge, removeBadge, grantBadge,
} as ServerTagsSectionActions;

export const inviteActions = { listRoles, getHubSettings, saveHubSettings } as InviteManagerActions;

export const webhookActions = {
  loadWebhooks: adminListWebhooks,
  createWebhook: adminCreateWebhook,
  regenerateWebhook: adminRegenerateWebhook,
  deleteWebhook: adminDeleteWebhook,
};

export const auditLogActions = { getAuditLog } as AuditLogSectionActions;

/** A hub's `/info`, as an issuer the user can trust by address. */
export async function lookupIssuerHub(url: string): Promise<IssuerHub> {
  const base = url.trim().replace(/\/$/, "");
  const info = (await (await rawFetch(`${base}/info`)).json()) as { name: string; icon?: string | null; public_key: string };
  return { pubkey: info.public_key, name: info.name, url: base, icon: info.icon ?? null };
}

async function listKnownIssuerHubs(): Promise<IssuerHub[]> {
  const alliances = await listAlliances().catch(() => []);
  const partners = (await Promise.all(alliances.map((a) => getAllianceMembers(a.id).catch(() => [])))).flat();
  return knownIssuerHubs(listHubs(), partners, listHubs().find((h) => h.hub_id === getActiveHubId())?.hub_url);
}

export const certActions = {
  listCertIssuances, getCertSettings, saveCertSettings, issueCertManual, revokeCert, grantUserBadge,
  listKnownHubs: listKnownIssuerHubs,
  lookupHub: lookupIssuerHub,
} as CertificationsSectionActions;

export const soundboardActions = {
  listSoundboardClips, uploadSoundboardClip, deleteSoundboardClip, fetchSoundboardAudioBytes,
} as SoundboardAdminSectionActions;

export const onboardingActions = {
  listPendingUsers, approvePendingUser, setLobbySettings, setChallengeSettings,
} as OnboardingAdminSectionActions;

export const allianceActions = {
  listAlliances, createAlliance, leaveAlliance,
  listPendingAllianceInvites,
  acceptAllianceInvite: (inviteId: string, ownHubUrl: string) => acceptAllianceInvite(inviteId, ownHubUrl).then(() => {}),
  declineAllianceInvite,
  listAllianceSharedChannels, shareChannelWithAlliance, unshareChannelFromAlliance,
  setAllianceVoiceRemoteJoin,
  createAllianceInvite, sendAlliancePushInvite,
  getAlliancePeopleVisible: (allianceId: string) =>
    activeHubSupports("alliance.people") ? getAlliancePeopleVisible(allianceId) : Promise.resolve(null),
  setAlliancePeopleVisible,
  listAllianceManagers: (allianceId: string) =>
    activeHubSupports("alliance.permissions") ? listAllianceManagers(allianceId) : Promise.resolve(null),
  grantAllianceManager,
  revokeAllianceManager,
  joinAllianceByCode: (inviterHubUrl: string, allianceId: string, inviteToken: string, ownHubUrl: string) =>
    joinAllianceByCode(inviterHubUrl, allianceId, inviteToken, ownHubUrl).then(() => {}),
};

export const hubIconActions = { listHubIcons, createHubIcon, renameHubIcon, deleteHubIcon };

export const surveyActions = {
  getSurveyAdmin, setSurveyAdmin, getSurveyResponses,
  loadAssignableRoles: () =>
    listRoles().then((roles) => roles.filter((r) => r.id !== "builtin-owner").map((r) => ({ id: r.id, name: r.name }))),
};

