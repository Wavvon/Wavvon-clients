import type { ProfileEditorActions } from "@wavvon/ui";
import { getMyProfileOnHub, updateMyProfileOnHub, getFindableByAllies, setFindableByAllies, getWidgetHidden, setWidgetHidden, NO_HUB_SESSION, listMyCertifications } from "@platform";
import { loadDefaultProfile, saveDefaultProfile, loadFollowsDefault, saveFollowsDefault } from "./profiles";

// Web's platform wiring for the shared ProfileEditorSection (packages/ui):
// hub sessions via @platform, the local default profile via utils/profiles.
// Used by Settings and by the onboarding profile step.
export const profileEditorActions: ProfileEditorActions = {
  getMyProfileOnHub,
  updateMyProfileOnHub,
  noHubSessionError: NO_HUB_SESSION,
  loadDefaultProfile: (accountId) => loadDefaultProfile(accountId),
  saveDefaultProfile: (profile, accountId) => saveDefaultProfile(profile, accountId),
  loadFollowsDefault: (accountId) => loadFollowsDefault(accountId),
  saveFollowsDefault: (hubIds, accountId) => saveFollowsDefault(hubIds, accountId),
  listMyCertifications,
  loadFindableByAllies: getFindableByAllies,
  saveFindableByAllies: setFindableByAllies,
  loadWidgetHidden: getWidgetHidden,
  saveWidgetHidden: setWidgetHidden,
};
