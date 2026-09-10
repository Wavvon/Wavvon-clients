import { hubFetch } from "@platform";
import {
  submitToDirectory,
  getRecoveryContacts, setRecoveryContacts, removeRecoveryContact,
  listAdminRecoveryRequests, approveRecoveryRequest, denyRecoveryRequest,
  openRotationRequest, getRotationRequestBundle, attestRotationRequest,
} from "@platform";
import { HubAdminPage, RecoveryContactsSection, OutgoingWebhooksSection } from "@wavvon/ui";
import type { RecoveryContactsSectionActions } from "@wavvon/ui";
import {
  rolesActions, memberRoleActions, serverTagsActions, inviteActions,
  webhookActions, externalBotActions, auditLogActions,
  certActions, soundboardActions, onboardingActions, allianceActions,
  hubIconActions, surveyActions,
} from "../../platform/adminActions";
import { ModerationTab } from "./ModerationTab";
import { outgoingWebhookActions } from "./outgoingWebhookActions";
import { BotCapabilitiesPanel } from "./BotCapabilitiesPanel";
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
  canManageRoles: boolean;
  canManageSoundboard: boolean;
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
  isAdmin, canManageRoles, canManageSoundboard, myMaxPriority, onClose,
}: HubAdminContainerProps) {
  const activeHubUrl = hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? "";

  return (
    <div className="modal-overlay" style={{ display: "flex", alignItems: "stretch", justifyContent: "stretch" }}>
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
        onApproveMember={(pk) => hubFetch(`/hub/pending/${pk}/approve`, { method: "POST" }).catch(() => {})}
        members={hubAdmin.hubAdminMembers}
        onKickMember={(pk) => hubFetch(`/moderation/kick`, { method: "POST", body: JSON.stringify({ target_public_key: pk }) }).catch(() => {})}
        onBanMember={(pk) => hubFetch(`/moderation/bans`, { method: "POST", body: JSON.stringify({ target_public_key: pk }) }).catch(() => {})}
        onMuteMember={hubAdmin.onMuteMember}
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
        canManageRoles={canManageRoles}
        myMaxPriority={myMaxPriority}
        onMemberRolesChanged={hubAdmin.setMemberRoles}
        onCreateInvite={(maxUses, expiresIn, grantRoleId) =>
          hubFetch("/invites", { method: "POST", body: JSON.stringify({ max_uses: maxUses, expires_in_seconds: expiresIn, grant_role_id: grantRoleId }) })
            .then((r) => r.json() as Promise<InviteInfo>)
            .then((inv) => hubAdmin.addInvite(inv))
            .catch(() => {})
        }
        onRevokeInvite={(code) => {
          hubFetch(`/invites/${code}`, { method: "DELETE" }).catch(() => {});
          hubAdmin.removeInvite(code);
        }}
        channels={channels}
        rolesActions={rolesActions}
        memberRoleActions={memberRoleActions}
        serverTagsActions={serverTagsActions}
        inviteActions={inviteActions}
        webhookActions={webhookActions}
        externalBotActions={externalBotActions}
        renderBotCapabilities={(pubkey) => <BotCapabilitiesPanel pubkey={pubkey} />}
        auditLogActions={auditLogActions}
        certActions={certActions}
        soundboardActions={soundboardActions}
        onboardingActions={onboardingActions}
        allianceActions={allianceActions}
        hubIconActions={hubIconActions}
        surveyActions={surveyActions}
        renderModerationTab={() => <ModerationTab />}
        renderOutgoingWebhooks={() => (
          <OutgoingWebhooksSection channels={channels} actions={outgoingWebhookActions} />
        )}
        renderRecoveryContacts={() => {
          const recoveryActions: RecoveryContactsSectionActions = {
            getContacts: getRecoveryContacts,
            setContacts: setRecoveryContacts,
            removeContact: removeRecoveryContact,
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
    </div>
  );
}
