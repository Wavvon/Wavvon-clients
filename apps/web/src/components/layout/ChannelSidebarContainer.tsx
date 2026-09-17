import { useState } from "react";
import { useTranslation } from "react-i18next";
import type React from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { formatPubkey } from "@wavvon/core";
import type { Channel, TreeNode } from "@wavvon/core";
import { ChannelSidebar } from "@wavvon/ui";
import type { WhisperReplyBind } from "@wavvon/ui";
import { listRoles, listSoundboardClips } from "@platform";
import { activeHubSupports } from "../../platform/session";
import { hasDraft } from "../../utils/drafts";
import type { useVoice } from "../../hooks/useVoice";
import type { useVideo } from "../../hooks/useVideo";
import type { useWhisper } from "../../hooks/useWhisper";
import type { useVoiceMoveUx, usePresenceStatus } from "@wavvon/ui";
import type { useNotificationPrefs } from "../../hooks/useNotificationPrefs";
import type { useHubLifecycle } from "../../hooks/useHubLifecycle";
import type { useDms } from "../../hooks/useDms";
import type { useAlliances } from "../../hooks/useAlliances";
import type { useScreenShare } from "../../hooks/useScreenShare";
import type { useChannelCrud } from "../../hooks/useChannelCrud";
import type { useChannelMessages } from "../../hooks/useChannelMessages";
import type { useHubAdmin } from "../../hooks/useHubAdmin";
import type { SoundboardChip, UnreadCounts } from "@wavvon/ui";
import type { AllianceSharedChannel, User } from "@shared/types";

type VoiceState = ReturnType<typeof useVoice>;
type VideoState = ReturnType<typeof useVideo>;
type WhisperState = ReturnType<typeof useWhisper>;
type VoiceMoveUxState = ReturnType<typeof useVoiceMoveUx>;
type NotifyPrefsState = ReturnType<typeof useNotificationPrefs>;
type HubLifecycleState = ReturnType<typeof useHubLifecycle>;
type UnreadCountsState = UnreadCounts;
type DmsState = ReturnType<typeof useDms>;
type AlliancesState = ReturnType<typeof useAlliances>;
type PresenceState = ReturnType<typeof usePresenceStatus>;
type ScreenShareState = ReturnType<typeof useScreenShare>;
type ChannelCrudState = ReturnType<typeof useChannelCrud>;
type ChannelMessagesState = ReturnType<typeof useChannelMessages>;
type HubAdminState = ReturnType<typeof useHubAdmin>;

export interface ChannelSidebarContainerProps {
  voice: VoiceState;
  video: VideoState;
  whisper: WhisperState;
  voiceMoveUx: VoiceMoveUxState;
  notifyPrefs: NotifyPrefsState;
  hubLifecycle: HubLifecycleState;
  onRequestRemoveHub: (hubId: string) => void;
  unreadCounts: UnreadCountsState;
  dms: DmsState;
  alliances: AlliancesState;
  presence: PresenceState;
  screenShare: ScreenShareState;
  channelCrud: ChannelCrudState;
  channelMessages: ChannelMessagesState;
  hubAdmin: HubAdminState;

  view: "channels" | "dms";
  channels: Channel[];
  channelTree: TreeNode[];
  users: User[];
  publicKey: string | null;
  isAdmin: boolean;
  canCreateInvites: boolean;
  canManageRoles: boolean;
  canEditChannelPermissions: boolean;
  canMoveMembers: boolean;
  canUseSoundboard: boolean;
  silencedChannelIds: Set<string>;
  soundboardChipsByChannel: Record<string, SoundboardChip[]>;
  whisperReplyBind: WhisperReplyBind;
  onSetWhisperReplyBind: (bind: WhisperReplyBind) => void;
  onOpenQuickInvite: () => void;
  onChannelContextMenu: (e: React.MouseEvent, channel: Channel) => void;
  onOpenFriends: () => void;
  onOpenSettings: () => void;
  settingsNeedsAttention?: boolean;
  onOpenSearch: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}

// Wraps the shared ChannelSidebar (~90 flat props) so App.tsx threads whole
// hook-result objects instead — the ChannelSidebar prop surface itself is
// unchanged. Modeled on HubAdminContainer's `hubAdmin={...}` pattern
// (decisions.md state-access-design.md Phase 1). Also owns the two bits of
// UI-local state (hub dropdown, whisper panel) that only this component reads.
export function ChannelSidebarContainer({
  voice, video, whisper, voiceMoveUx, notifyPrefs, hubLifecycle, unreadCounts, onRequestRemoveHub,
  dms, alliances, presence, screenShare, channelCrud, channelMessages, hubAdmin,
  view, channels, channelTree, users, publicKey, isAdmin, canCreateInvites,
  canManageRoles, canEditChannelPermissions, canMoveMembers, canUseSoundboard, silencedChannelIds,
  soundboardChipsByChannel, whisperReplyBind, onSetWhisperReplyBind,
  onOpenQuickInvite, onChannelContextMenu, onOpenFriends, onOpenSettings, settingsNeedsAttention,
  onOpenSearch, onDragEnd,
}: ChannelSidebarContainerProps) {
  const { t } = useTranslation();
  const [hubDropdownOpen, setHubDropdownOpen] = useState(false);
  const [showWhisperPanel, setShowWhisperPanel] = useState(false);
  // Our hub has to sign the grant, so its capability decides whether the
  // affordance exists at all. The owning hub's half is checked when the grant
  // is redeemed — asking every allied hub for its /info on every load would be
  // a request storm for a button almost nobody presses.
  const allianceVoice = activeHubSupports("voice.alliance");

  const { selectedChannel, handleSelectChannel, handleSelectAllianceChannel } = channelMessages;
  const { activeHubId, hubs, activeHubTimezone, pingByHub } = hubLifecycle;

  return (
    <ChannelSidebar
      view={view}
      activeHubId={activeHubId}
      hubs={hubs}
      channels={channels}
      selectedChannel={selectedChannel}
      unreadByChannel={unreadCounts.unreadByChannel}
      collapsedCategories={notifyPrefs.collapsedCategories}
      voicePartByChannel={voice.voicePartByChannel}
      voiceChannelId={voice.voiceChannelId}
      voiceChannelNameHint={voiceMoveUx.voiceChannelNameHint}
      selfMuted={voice.selfMuted}
      selfDeafened={voice.selfDeafened}
      users={users}
      publicKey={publicKey}
      pingByHub={pingByHub}
      isAdmin={isAdmin}
      canCreateInvites={canCreateInvites}
      hubNotifyMode={notifyPrefs.hubNotifyMode}
      hubDropdownOpen={hubDropdownOpen}
      hubTimezone={activeHubTimezone}
      hideSilenced={notifyPrefs.hideSilenced}
      silencedChannelIds={silencedChannelIds}
      userAlliances={alliances.userAlliances}
      allianceChannels={alliances.allianceChannels}
      selectedAllianceChannel={alliances.selectedAllianceChannel}
      conversations={dms.conversations}
      selectedConversation={dms.selectedConversation}
      unreadDms={unreadCounts.unreadDms}
      channelTree={channelTree}
      effectiveNotifyMode={notifyPrefs.effectiveNotifyMode}
      onToggleCategoryCollapsed={(hubId, catId) =>
        notifyPrefs.setCollapsedCategories((prev) => {
          const m = { ...(prev[hubId] ?? {}) };
          if (m[catId]) delete m[catId]; else m[catId] = true;
          return { ...prev, [hubId]: m };
        })
      }
      onHubDropdownOpenChange={setHubDropdownOpen}
      onSetHubMode={(hubId, mode) =>
        notifyPrefs.setHubNotifyMode((prev) => { const n = { ...prev }; if (mode === "all") delete n[hubId]; else n[hubId] = mode; return n; })
      }
      onToggleHideSilenced={notifyPrefs.toggleHideSilenced}
      onClearHubUnread={unreadCounts.clearHubUnread}
      onRemoveHub={onRequestRemoveHub}
      onOpenHubAdmin={() => void hubAdmin.openHubAdmin()}
      onOpenHubAdminInvites={() => { void hubAdmin.openHubAdmin(); hubAdmin.setHubAdminTab("invites"); }}
      onOpenQuickInvite={onOpenQuickInvite}
      onOpenCreateChannel={(parentId, isCategory) => {
        channelCrud.setChannelSettingsCtx(null);
        channelCrud.setCreateChannelCtx({ parentId, isCategory });
        channelCrud.setCreateChannelError(null);
      }}
      onSelectChannel={handleSelectChannel}
      onChannelContextMenu={onChannelContextMenu}
      canOpenChannelSettings={isAdmin || canEditChannelPermissions}
      myStatus={presence.myPresence.status === "online" ? null : presence.myPresence.status}
      onSetStatus={presence.handleSetStatus}
      onOpenChannelSettings={(channel) => {
        channelCrud.setCreateChannelCtx(null);
        channelCrud.setChannelSettingsCtx(channel);
        channelCrud.setChannelSettingsError(null);
      }}
      onVoiceJoin={(ch) => ch && void voice.handleVoiceJoin(ch.id)}
      onVoiceLeave={voice.handleVoiceLeave}
      onParticipantContextMenu={canMoveMembers ? (e, p, channelId) => {
        e.preventDefault();
        if (p.public_key === publicKey) return; // hide self — move your own voice by joining directly
        voiceMoveUx.setVoiceMoveMenu({
          pubkey: p.public_key,
          displayName: p.display_name || formatPubkey(p.public_key),
          position: { x: e.clientX, y: e.clientY },
          currentChannelId: channelId,
        });
      } : undefined}
      onSelectAllianceChannel={(a, c) => handleSelectAllianceChannel(a, c as AllianceSharedChannel)}
      onJoinAllianceVoice={allianceVoice ? (a, c) => void voice.handleAllianceVoiceJoin(
        a.id,
        c.channel_id,
        // The visitor dials the owning hub directly, so its operator sees
        // this IP. Name the address before anything is minted.
        (ownerHubUrl, channelName) => window.confirm(t("alliance.voice.confirm", { hub: ownerHubUrl, channel: channelName })),
      ) : undefined}
      onOpenFriends={onOpenFriends}
      onSelectConversation={dms.handleSelectConversation}
      onToggleSelfMute={voice.handleToggleMute}
      onToggleSelfDeafen={voice.handleToggleDeafen}
      onOpenSettings={onOpenSettings}
      settingsNeedsAttention={settingsNeedsAttention}
      onDragEnd={onDragEnd}
      voiceGains={voice.voiceGains}
      onSetVoiceGain={voice.handleSetVoiceGain}
      inboundWhispers={whisper.inboundWhispers}
      hasDraft={hasDraft}
      onOpenSearch={onOpenSearch}
      canUseSoundboard={canUseSoundboard}
      onListSoundboardClips={listSoundboardClips}
      onTriggerSoundboardClip={voice.handleTriggerSoundboardClip}
      soundboardPlayingClipId={voice.soundboardPlayingClipId}
      soundboardChips={voice.voiceChannelId ? soundboardChipsByChannel[voice.voiceChannelId] ?? [] : []}
      sharing={screenShare.sharing}
      onScreenShare={() => {
        if (screenShare.sharing) screenShare.handleStopShare();
        else if (selectedChannel) void screenShare.handleStartShare(selectedChannel.id);
      }}
      videoEnabled={video.videoEnabled}
      onToggleVideo={video.handleToggleVideo}
      isWhispering={whisper.isWhispering}
      whisperTargets={whisper.whisperTargets}
      whisperLists={whisper.whisperLists}
      showWhisperPanel={showWhisperPanel}
      onToggleWhisperPanel={() => setShowWhisperPanel((p) => !p)}
      onCloseWhisperPanel={() => setShowWhisperPanel(false)}
      onStartWhisper={whisper.startWhisper}
      onStopWhisper={whisper.stopWhisper}
      onSaveWhisperList={whisper.saveWhisperList}
      onDeleteWhisperList={whisper.deleteWhisperList}
      onListWhisperRoles={() => listRoles().then((rs) => rs.map((r) => ({ id: r.id, name: r.name })))}
      whisperReplyBind={whisperReplyBind}
      onSetWhisperReplyBind={onSetWhisperReplyBind}
      whisperOptout={whisper.whisperOptout}
      onSetWhisperOptout={whisper.setWhisperOptout}
    />
  );
}
