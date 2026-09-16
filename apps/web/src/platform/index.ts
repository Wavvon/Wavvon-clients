export { get_hub_ws_info, activeSession, getActiveHubId, setActiveHubId, resetHubSessions, getSession, allSessions, hubSupports, activeHubCapabilities, activeHubSupports } from "./session";
export { hubFetch, rawFetch, HubApiError, fetchWithTimeout, isNotMemberError } from "./http";
export { hubFetchAs } from "./hubFetchAs";
export { HubWebSocket } from "./ws";
export type { WsHandlers } from "./ws";
export {
  loadSavedHubs,
  saveSavedHubs,
  upsertSavedHub,
  removeSavedHub,
  loadActiveHubId,
  saveActiveHubId,
  saveToken,
  loadToken,
  clearToken,
} from "./storage";
export type { SavedHub } from "./storage";

export {
  addHub,
  listHubs,
  setActiveHub,
  removeHub,
  leaveHub,
  redeemInvite,
  pingHub,
  reauthorizeHub,
  upgradeActiveHubIdentity,
  refreshHubInfo,
  previewHubInfo,
  verifyLanFingerprint,
  reorderHubs,
  restorePersistedHubs,
  connectHubWebSocket,
} from "./commands/hubs";

export { getLobbyStatus, getLobbyWelcome, submitLobbyPow, isLobbyScopeConfined } from "./commands/lobby";
export type { LobbyStatus, LobbyWelcome, SubmitPowResult } from "./commands/lobby";

export {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  searchMessages,
  subscribeChannel,
  unsubscribeChannel,
  getUnreadCounts,
  markChannelRead,
  sendTypingEvent,
  sendDmTypingEvent,
  sendSetStatus,
  sendSetStatusTo,
  getAllianceChannelMessages,
  sendAllianceChannelMessage,
} from "./commands/messages";
export type { UnreadCount } from "./commands/messages";

export { sendBotAppJoin, listBotCommands, listBots, getBotProfile } from "./commands/bots";

export {
  listConversations,
  getConversation,
  createConversation,
  getDmMessages,
  sendDm,
  fetchDhKey,
  publishDhKey,
} from "./commands/dms";

export {
  getHomeHubDesignation,
  putHomeHubDesignation,
  listDeviceCerts,
  registerDeviceCert,
  listDeviceRevocations,
  postDeviceRevocation,
  getPrefsBlob,
  postPairingOffer,
  postPairingClaim,
  postPairingComplete,
  getPairingStatus,
} from "./commands/identity";

export {
  getDiscoveryTags,
  setDiscoveryTags,
  submitToDirectory,
  listBadges,
  listPendingBadges,
  acceptBadge,
  declineBadge,
  removeBadge,
  grantBadge,
  listCertIssuances,
  getCertSettings,
  saveCertSettings,
  issueCertManual,
  revokeCert,
  getRecoveryContacts,
  setRecoveryContacts,
  removeRecoveryContact,
  listAdminRecoveryRequests,
  approveRecoveryRequest,
  denyRecoveryRequest,
  openRotationRequest,
  getRotationRequestBundle,
  attestRotationRequest,
  updateDmBlocks,
  getDmBlocks,
  moveChannel,
  reorderChannels,
  saveHubSettings,
  getHubSettings,
  createInvite,
  getHubListingStatus,
  setHubListed,
  listInvites,
} from "./commands/hubAdmin";

export {
  forumListPosts,
  forumGetPost,
  forumCreatePost,
  forumEditPost,
  forumDeletePost,
  forumCreateReply,
  forumEditReply,
  forumDeleteReply,
  forumPinPost,
  forumLockPost,
  markPostRead,
  forumAddPostReaction,
  forumRemovePostReaction,
  forumAddReplyReaction,
  forumRemoveReplyReaction,
  forumListTags,
  forumCreateTag,
  forumEditTag,
  forumDeleteTag,
  getAllianceChannelPosts,
  getAllianceChannelPost,
  createAllianceChannelPost,
  createAllianceChannelReply,
  reactAllianceChannelPost,
  allianceForumWriteErrorCode,
} from "./commands/forum";
export type { AllianceForumWriteErrorCode } from "./commands/forum";

export { uploadFile } from "./commands/uploads";

export { fetchLinkPreview } from "./commands/linkPreview";

export { pinMessage, unpinMessage, getPins } from "./commands/pins";

export { getUserProfile } from "./commands/profiles";

export { getMyProfileOnHub, updateMyProfileOnHub, patchMyProfileOnHub, NO_HUB_SESSION, type MyHubProfile } from "./commands/myProfile";

export { createPoll, getPolls, votePoll, deletePoll } from "./commands/polls";

export {
  getEvents,
  getEvent,
  createEvent,
  rsvpEvent,
  deleteEvent,
  getEventRsvps,
  getEventAssignments,
  createEventSquadRooms,
} from "./commands/events";
export type { CreateEventSlotInput } from "./commands/events";

export { getNotifPref, setNotifPref } from "./notifPrefs";

export { fetchVoiceRoster } from "./commands/voice";

export {
  listSoundboardClips,
  uploadSoundboardClip,
  deleteSoundboardClip,
  markSoundboardPlayed,
  soundboardAudioPath,
  fetchSoundboardAudioBytes,
} from "./commands/soundboard";

export {
  fetchMemberHistory,
  reportMessage,
  listReports,
  reviewReport,
  getModerationSettings,
  patchModerationSettings,
  getBanlistSettings,
  addBanlistSource,
  removeBanlistSource,
  updateBanlistSourcePolicy,
  getBanlistEntries,
  getBanlistOverrides,
  addBanlistOverride,
  removeBanlistOverride,
  setBanlistPublish,
  muteMember,
  timeoutMember,
  voiceMuteMember,
  voiceUnmuteMember,
  listVoiceMutes,
  listBans,
} from "./commands/moderation";
export type { VoiceMuteInfo } from "./commands/moderation";

export {
  getChannelPermissions,
  listPermissionCatalogue,
  getMyChannelPermissions,
  setChannelRolePermissions,
  clearChannelRolePermissions,
} from "./commands/channelPermissions";
export type { MyChannelPermissions } from "./commands/channelPermissions";

export { fetchAllUsers } from "./commands/users";
export { listRoles, createRole, updateRole, deleteRole, listUserRoles, assignRoleToUser, removeRoleFromUser } from "./commands/roles";
export type { RoleCreateInput, RoleUpdateInput } from "./commands/roles";

export {
  listFriends,
  listPendingFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
} from "./commands/friends";

export { getAuditLog } from "./commands/audit";
export type { AuditLogEntry, AuditLogPage } from "./commands/audit";
export { listChannelBans, banFromChannel, unbanFromChannel } from "./commands/channelBans";
export type { ChannelBan } from "./commands/channelBans";
export { getTalkPower, setTalkPower } from "./commands/talkPower";
export { listHubIcons, createHubIcon, renameHubIcon, deleteHubIcon } from "./commands/hubIcons";
export type { HubIcon } from "./commands/hubIcons";
export {
  listAlliances, createAlliance, leaveAlliance,
  listPendingAllianceInvites, acceptAllianceInvite, declineAllianceInvite,
  listAllianceSharedChannels, shareChannelWithAlliance, unshareChannelFromAlliance,
  setAllianceVoiceRemoteJoin,
  createAllianceInvite, sendAlliancePushInvite, joinAllianceByCode,
} from "./commands/alliances";
export type { Alliance, AllianceDetail, AllianceMember, AllianceInvite, PendingAllianceInvite, SharedChannel } from "./commands/alliances";
export {
  setLobbySettings, listPendingUsers, approvePendingUser, setChallengeSettings,
} from "./commands/onboardingAdmin";
export type { PendingUser, ChallengeMode, ChallengeDifficulty } from "./commands/onboardingAdmin";
export { listMyCertifications, grantUserBadge } from "./commands/certifications";
export type { Certification } from "./commands/certifications";
export { getSurveyAdmin, setSurveyAdmin, getSurveyResponses, getCurrentSurvey, submitSurvey } from "./commands/survey";
export type { SurveyAdmin, SurveyQuestion, SurveyChoice, SurveyResponseView, SurveyAnswerInput } from "./commands/survey";

export {
  listRoleCategories,
  createRoleCategory,
  updateRoleCategory,
  deleteRoleCategory,
} from "./commands/roleCategories";
export type { RoleCategoryCreateInput, RoleCategoryUpdateInput } from "./commands/roleCategories";

export {
  isPasskeySupported,
  passkeysUsableWith,
  registerPasskey,
  authenticateWithPasskey,
  listPasskeys,
  deletePasskey,
  renamePasskey,
  listTrustedDevices,
  revokeTrustedDevice,
} from "./webauthn";
export type { CredentialInfo, DeviceInfo } from "./webauthn";
