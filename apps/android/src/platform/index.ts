export { get_hub_ws_info, activeSession, getActiveHubId, setActiveHubId } from "./session";
export { hubFetch, rawFetch, HubApiError } from "./http";
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
  pingHub,
  reauthorizeHub,
  getHubInfo,
  previewHubInfo,
  reorderHubs,
  restorePersistedHubs,
} from "./commands/hubs";

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
} from "./commands/messages";

export {
  listConversations,
  createConversation,
  getDmMessages,
  sendDm,
  fetchDhKey,
  publishDhKey,
} from "./commands/dms";

export { sendComponentInteraction } from "./commands/bots";

export {
  getRecoveryContacts,
  setRecoveryContacts,
  removeRecoveryContact,
  listAdminRecoveryRequests,
  approveRecoveryRequest,
  denyRecoveryRequest,
  updateDmBlocks,
} from "./commands/hubAdmin";

export {
  getPairedIdentity,
  startPairingOffer,
  pollPairingStatus,
  completePairing,
  fingerprintPubkey,
  parsePairingOffer,
  claimPairingOffer,
  savePairedIdentity,
} from "./commands/pairing";
export type {
  PairingOffer,
  PairingStatus,
  PairedIdentityInfo,
  StartPairingResult,
  ClaimResult,
  SyncResult,
} from "./commands/pairing";
