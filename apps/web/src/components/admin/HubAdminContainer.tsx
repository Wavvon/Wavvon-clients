import { hubFetch, activeHubSupports, getApplicationResponse, rejectApplication, getAttachmentSettings, saveAttachmentSettings } from "@platform";
import {
  submitToDirectory,
  getRecoveryContacts, setRecoveryContacts, removeRecoveryContact,
  listAdminRecoveryRequests, approveRecoveryRequest, denyRecoveryRequest,
  openRotationRequest, getRotationRequestBundle, attestRotationRequest,
} from "@platform";
import { HubAdminPage, RecoveryContactsSection, OutgoingWebhooksSection, SettingsModal } from "@wavvon/ui";
import type { RecoveryContactsSectionActions } from "@wavvon/ui";
import {
  rolesActions, rolesActionsWithOrder, memberRoleActions, serverTagsActions, inviteActions,
  webhookActions, auditLogActions,
  certActions, soundboardActions, onboardingActions, allianceActions,
  hubIconActions, surveyActions, applicationActions,
  stickerPacksActions, stickerStorageActions, stickerSettingsActions,
} from "../../platform/adminActions";
import { ModerationTab } from "./ModerationTab";
import { getWidget, putWidget } from "@platform";

// Module-level: the section reloads whenever its actions object changes.
const widgetActions = { getWidget, putWidget };
import { listRecoveryPeople, listRecoveryRequestsToAttest } from "../../platform/commands/recoveryPeople";
import { outgoingWebhookActions } from "./outgoingWebhookActions";
import type { useHubAdmin } from "../../hooks/useHubAdmin";
import type { Channel, Hub, InviteInfo } from "@shared/types";

type HubAdminState = ReturnType<typeof useHubAdmin>;

export interface HubAdminContainerProps {
  hubAdmin: HubAdminState;
  channels: Channel[];
  hubs: Hub[];
  activeHubId: string;
  publicKey: string | null;
  isAdmin: boolean;
  canDo: (permission: string) => boolean;
  canManageRoles: boolean;
  canManageSoundboard: boolean;
  canManageHubAlliances: boolean;
  myMaxPriority: number;
  onClose: () => void;
}

// App-local wrapper around the shared HubAdminPage: bakes in the static
// @platform-only action objects (moderation.md-adjacent moderation/webhooks
// stay as render props since they need `channels`) and forwards the dynamic
// admin state App/useHubAdmin own. Per-app action-wiring wrappers are
// explicitly allowed to live outside packages/ui (decisions.md 2026-07-18/20).
export function HubAdminContainer({
  hubAdmin, channels, hubs, activeHubId, publicKey,
  isAdmin, canDo, canManageRoles, canManageSoundboard, canManageHubAlliances, myMaxPriority, onClose,
}: HubAdminContainerProps) {
  const activeHubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "";
  const stickersAdmin = activeHubSupports("stickers")
    ? {
        hubUrl: activeHubUrl,
        packs: canDo("stickers.packs.manage") ? stickerPacksActions : undefined,
        storage: canDo("stickers.moderate") ? stickerStorageActions : undefined,
        settings: canDo("hub.settings") ? stickerSettingsActions : undefined,
      }
    : undefined;

  return (
    <SettingsModal onClose={onClose}>
      <HubAdminPage
        tab={hubAdmin.hubAdminTab}
        onTab={hubAdmin.setHubAdminTab}
        onClose={onClose}
        hubName={hubAdmin.hubAdminName}
        onHubNameChange={hubAdmin.setHubAdminName}
        hubDescription={hubAdmin.hubAdminDescription}
        onHubDescriptionChange={hubAdmin.setHubAdminDescription}
        hubIcon={hubAdmin.hubAdminIcon}
        onHubIconChange={hubAdmin.setHubAdminIcon}
        requireApproval={hubAdmin.hubAdminRequireApproval}
        onRequireApprovalChange={hubAdmin.setHubAdminRequireApproval}
        minSecurityLevel={hubAdmin.hubAdminMinLevel}
        onMinSecurityLevelChange={hubAdmin.setHubAdminMinLevel}
        maxChannelDepth={hubAdmin.maxChannelDepth}
        maxAttachmentBytes={hubAdmin.hubAdminMaxAttachmentBytes}
        onMaxAttachmentBytesChange={hubAdmin.setHubAdminMaxAttachmentBytes}
        onMaxChannelDepthChange={hubAdmin.setMaxChannelDepth}
        welcomeLabel={hubAdmin.hubAdminWelcomeLabel}
        onWelcomeLabelChange={hubAdmin.setHubAdminWelcomeLabel}
        welcomeInviteUrl={hubAdmin.hubAdminWelcomeInviteUrl}
        onWelcomeInviteUrlChange={hubAdmin.setHubAdminWelcomeInviteUrl}
        farewellLabel={hubAdmin.hubAdminFarewellLabel}
        onFarewellLabelChange={hubAdmin.setHubAdminFarewellLabel}
        timezone={hubAdmin.hubAdminTimezone}
        onTimezoneChange={hubAdmin.setHubAdminTimezone}
        birthdaysEnabled={hubAdmin.hubAdminBirthdaysEnabled}
        onBirthdaysEnabledChange={hubAdmin.setHubAdminBirthdaysEnabled}
        nameColorMode={hubAdmin.hubAdminNameColorMode}
        onNameColorModeChange={hubAdmin.setHubAdminNameColorMode}
        afkChannelId={hubAdmin.hubAdminAfkChannelId}
        onAfkChannelIdChange={hubAdmin.setHubAdminAfkChannelId}
        afkTimeoutSecs={hubAdmin.hubAdminAfkTimeoutSecs}
        onAfkTimeoutSecsChange={hubAdmin.setHubAdminAfkTimeoutSecs}
        saveError={hubAdmin.hubAdminSaveError}
        onSave={hubAdmin.saveHubAdminSettings}
        hubListed={hubAdmin.hubListed}
        onHubListedChange={hubAdmin.onHubListedChange}
        submitToDirectory={submitToDirectory}
        pendingMembers={hubAdmin.hubAdminPending}
        onApproveMember={(pk) => hubFetch(`/hub/pending/${pk}/approve`, { method: "POST" })
          .then(() => hubAdmin.dropPending(pk)).catch(() => {})}
        loadApplication={getApplicationResponse}
        onRejectMember={async (pk, reason) => { await rejectApplication(pk, reason); hubAdmin.dropPending(pk); }}
        members={hubAdmin.hubAdminMembers}
        onKickMember={hubAdmin.onKickMember}
        onBanMember={hubAdmin.onBanMember}
        onMuteMember={hubAdmin.onMuteMember}
        onUnmuteMember={hubAdmin.onUnmuteMember}
        mutes={hubAdmin.mutes}
        onTimeoutMember={hubAdmin.onTimeoutMember}
        onVoiceMuteMember={hubAdmin.onVoiceMuteMember}
        onVoiceUnmuteMember={hubAdmin.onVoiceUnmuteMember}
        voiceMutedKeys={hubAdmin.voiceMutedKeys}
        bans={hubAdmin.hubAdminBans}
        onUnban={(pk) => hubFetch(`/moderation/bans/${pk}`, { method: "DELETE" }).catch(() => {})}
        invites={hubAdmin.hubAdminInvites}
        activeHubUrl={activeHubUrl}
        myPubkey={publicKey ?? ""}
        isAdmin={isAdmin}
        canManageSoundboard={canManageSoundboard}
        canManageHubAlliances={canManageHubAlliances}
        canManageRoles={canManageRoles}
        myMaxPriority={myMaxPriority}
        onMemberRolesChanged={hubAdmin.setMemberRoles}
        supportsBoundInvites={activeHubSupports("invites.bound")}
        onCreateInvite={(maxUses, expiresIn, grantRoleId, boundPubkey) =>
          hubFetch("/invites", { method: "POST", body: JSON.stringify({ max_uses: maxUses, expires_in_seconds: expiresIn, grant_role_id: grantRoleId, bound_pubkey: boundPubkey }) })
            .then((r) => r.json() as Promise<InviteInfo>)
            .then((inv) => hubAdmin.addInvite(inv))
            .catch(() => {})
        }
        onRevokeInvite={(code) => {
          hubFetch(`/invites/${code}`, { method: "DELETE" }).catch(() => {});
          hubAdmin.removeInvite(code);
        }}
        channels={channels}
        rolesActions={activeHubSupports("roles.order") ? rolesActionsWithOrder : rolesActions}
        memberRoleActions={memberRoleActions}
        serverTagsActions={serverTagsActions}
        inviteActions={inviteActions}
        webhookActions={webhookActions}
        auditLogActions={auditLogActions}
        certActions={certActions}
        soundboardActions={soundboardActions}
        stickersAdmin={stickersAdmin}
        attachmentSettingsActions={activeHubSupports("attachments.stored") && canDo("hub.settings")
          ? { getSettings: getAttachmentSettings, saveSettings: saveAttachmentSettings }
          : undefined}
        widgetActions={activeHubSupports("hub.widget") && canDo("hub.settings") ? widgetActions : undefined}
        onboardingActions={onboardingActions}
        allianceActions={allianceActions}
        hubIconActions={hubIconActions}
        surveyActions={surveyActions}
        applicationActions={applicationActions}
        joinFormsCapable={activeHubSupports("admission.application")}
        renderModerationTab={() => <ModerationTab />}
        renderOutgoingWebhooks={() => (
          <OutgoingWebhooksSection channels={channels} actions={outgoingWebhookActions} />
        )}
        renderRecoveryContacts={() => {
          const recoveryActions: RecoveryContactsSectionActions = {
            getContacts: getRecoveryContacts,
            setContacts: setRecoveryContacts,
            removeContact: removeRecoveryContact,
            listPeople: listRecoveryPeople,
            listRequestsToAttest: listRecoveryRequestsToAttest,
            listAdminRequests: isAdmin ? listAdminRecoveryRequests : undefined,
            approveRequest: isAdmin ? approveRecoveryRequest : undefined,
            denyRequest: isAdmin ? denyRecoveryRequest : undefined,
            openRotationRequest: (oldPubkey, reason) => openRotationRequest(activeHubUrl, oldPubkey, reason),
            getRotationRequest: (id) => getRotationRequestBundle(activeHubUrl, id),
            attestRotationRequest: (bundle) => attestRotationRequest(activeHubUrl, bundle),
          };
          return <RecoveryContactsSection isAdmin={isAdmin} actions={recoveryActions} showMemberCards={false} />;
        }}
      />
    </SettingsModal>
  );
}
